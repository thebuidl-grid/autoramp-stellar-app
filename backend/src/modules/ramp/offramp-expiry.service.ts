import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { TransactionStatus } from '@prisma/client';
import { OfframpStateService } from './offramp-state.service';
import { isTimedOut, timeoutMsFor } from './offramp-state-machine';

interface ExpirableOrder {
  id: string;
  reference: string;
  offrampTransactionId: string | null;
  merchantOfframpTransactionId: string | null;
}

/** Funding-window expiry applies to orders still waiting on, or just receiving, the USDC deposit. */
const EXPIRABLE_STATUSES: TransactionStatus[] = [
  'PENDING',
  'PROCESSING',
  'INITIATED',
  'AWAITING_DEPOSIT',
];

/** Active states that are subject to the configurable per-state processing timeout (see timeoutMsFor). */
const STATE_TIMEOUT_STATUSES: TransactionStatus[] = [
  'PENDING',
  'INITIATED',
  'AWAITING_DEPOSIT',
  'DEPOSIT_DETECTED',
  'PROCESSING',
  'CONVERSION_PENDING',
  'PAYOUT_PENDING',
  'INSUFFICIENT_LIQUIDITY',
  'PARTIALLY_SETTLED',
];

/**
 * An order may be expired only when it has no cross-chain bridge funding leg
 * (ordinary Bitnob off-ramp), or when that bridge leg definitively failed
 * (refused or reversed). Bridge legs that are in flight/stuck/delivered are
 * excluded here so their orders are held open instead of swept.
 */
const EXPIRABLE_BRIDGE_FAILURE_STATUSES: string[] = [
  'FAILED',
  'REJECTED',
  'REVERSED',
];

/**
 * Expires off-ramp orders that never received their USDC deposit within the
 * payout funding window. Bitnob returns an `expiresAt` on the finalized
 * payout; orders without one fall back to a TTL measured from creation.
 *
 * Orders whose USDC funding deposit is delivered (or being delivered) via a
 * cross-chain bridge are held here instead of being swept as unfunded; only
 * orders with no in-flight bridge delivery — or whose bridge delivery
 * definitively failed (FAILED/REJECTED/REVERSED), leaving them unfunded —
 * are expired.
 *
 * Runs on a fixed interval in-process (mirrors the webhook worker heartbeat
 * pattern); there is no separate expiry worker.
 */
@Injectable()
export class OfframpExpiryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OfframpExpiryService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly offrampState: OfframpStateService,
  ) {}

  onModuleInit(): void {
    const intervalMs = Number(process.env.OFFRAMP_SWEEP_INTERVAL_MS) || 60_000;
    this.timer = setInterval(() => {
      this.sweep().catch((err) => {
        this.logger.error(
          `[offramp-expiry] sweep failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }, intervalMs);
    this.timer.unref?.();

    // Clear anything that expired while the process was down.
    this.sweep().catch((err) => {
      this.logger.error(
        `[offramp-expiry] boot sweep failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Expire all orders past their funding window. Returns how many were expired. */
  async sweep(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const now = new Date();
      const fallbackTtlMs =
        Number(process.env.OFFRAMP_EXPIRY_FALLBACK_MS) || 24 * 60 * 60 * 1000;
      const fallbackCutoff = new Date(now.getTime() - fallbackTtlMs);

      const orders = await this.prisma.offrampProviderOrder.findMany({
        where: {
          provider: 'bitnob',
          AND: [
            {
              OR: [
                { expiresAt: { lt: now } },
                { expiresAt: null, createdAt: { lt: fallbackCutoff } },
              ],
            },
            {
              // Sweep only orders with no bridge leg, or one that definitively
              // failed. In-flight/stuck (PENDING/PROCESSING/DELAYED/STUCK/
              // WAITING) and delivered (SUCCESS) bridge legs are held open.
              OR: [
                { bridgeReference: null },
                {
                  bridgeStatus: { in: EXPIRABLE_BRIDGE_FAILURE_STATUSES },
                },
              ],
            },
          ],
        },
        select: {
          id: true,
          reference: true,
          offrampTransactionId: true,
          merchantOfframpTransactionId: true,
        },
      });

      let expired = 0;
      for (const order of orders) {
        const didExpire = await this.expireOrder(order);
        if (didExpire) expired++;
      }

      expired += await this.sweepStateTimeouts(now);

      if (expired > 0) {
        this.logger.log(`[offramp-expiry] expired ${expired} order(s)`);
      }
      return expired;
    } finally {
      this.running = false;
    }
  }

  /**
   * Per-state processing timeouts (configurable via OFFRAMP_TIMEOUT_* env vars, see offramp-state-machine.ts):
   * a user off-ramp that has sat in an active state longer than that state's window is expired with the
   * reason + window recorded. Orders whose bridge funding leg is in flight are held open, as in the main sweep.
   */
  private async sweepStateTimeouts(now: Date): Promise<number> {
    const windows = STATE_TIMEOUT_STATUSES.map((s) => timeoutMsFor(s)).filter(
      (n): n is number => typeof n === 'number',
    );
    if (!windows.length) return 0;
    const cutoff = new Date(now.getTime() - Math.min(...windows));

    const candidates = await this.prisma.offrampTransaction.findMany({
      where: { status: { in: STATE_TIMEOUT_STATUSES }, updatedAt: { lt: cutoff } },
      include: { providerOrder: true },
      take: 200,
    });

    let expired = 0;
    for (const tx of candidates) {
      const po = tx.providerOrder;
      if (
        po?.bridgeReference &&
        !EXPIRABLE_BRIDGE_FAILURE_STATUSES.includes(po.bridgeStatus ?? '')
      ) {
        continue; // bridge leg in flight / delivered: hold open
      }
      if (!isTimedOut(tx.status, tx.updatedAt, now)) continue;

      const result = await this.offrampState.apply(tx.id, 'EXPIRED', {
        actor: 'expiry-sweeper',
        reason: 'timeout',
        eventKey: `expiry:${tx.id}`,
        eventType: 'state_timeout.expired',
        detail: {
          trigger: 'state_timeout',
          stateWhenExpired: tx.status,
          windowMs: timeoutMsFor(tx.status),
          since: tx.updatedAt.toISOString(),
          expiredAt: now.toISOString(),
          message: `Transaction stayed in ${tx.status} beyond its processing window`,
        },
      });
      if (result.outcome === 'APPLIED') {
        this.logger.log(
          `[offramp-expiry] ${tx.reference} expired: ${tx.status} exceeded its processing window`,
        );
        expired++;
      }
    }
    return expired;
  }

  private async expireOrder(order: ExpirableOrder): Promise<boolean> {
    const expiredAt = new Date();

    if (order.offrampTransactionId) {
      const tx = await this.prisma.offrampTransaction.findUnique({
        where: { id: order.offrampTransactionId },
      });
      if (!tx || !EXPIRABLE_STATUSES.includes(tx.status)) return false;

      // D1: expiry goes through the state machine (validated, logged, reason + timestamp recorded).
      const result = await this.offrampState.apply(tx.id, 'EXPIRED', {
        actor: 'expiry-sweeper',
        reason: 'timeout',
        eventKey: `expiry:${tx.id}`,
        eventType: 'funding_window.expired',
        detail: {
          trigger: 'funding_window',
          stateWhenExpired: tx.status,
          expiredAt: expiredAt.toISOString(),
          message:
            'USDC deposit not received before the payout funding window closed',
        },
      });
      if (result.outcome !== 'APPLIED') return false;

      await this.prisma.offrampTransaction.update({
        where: { id: tx.id },
        data: {
          metadata: {
            ...((tx.metadata as Record<string, any>) || {}),
            expiredAt: expiredAt.toISOString(),
            reason: 'timeout',
          },
        },
      });
    } else if (order.merchantOfframpTransactionId) {
      const tx = await this.prisma.merchantOfframpTransaction.findUnique({
        where: { id: order.merchantOfframpTransactionId },
      });
      if (!tx || !EXPIRABLE_STATUSES.includes(tx.status)) return false;

      await this.prisma.merchantOfframpTransaction.update({
        where: { id: tx.id },
        data: {
          status: 'EXPIRED',
          metadata: {
            ...((tx.metadata as Record<string, any>) || {}),
            expiredAt: expiredAt.toISOString(),
            reason: 'timeout',
          },
        },
      });

      await this.prisma.transactionLog.create({
        data: {
          transactionType: 'offramp',
          transactionId: tx.id,
          action: 'status_changed',
          oldStatus: tx.status,
          newStatus: 'EXPIRED',
          description:
            'Offramp expired: USDC deposit not received before the payout funding window closed',
        },
      });
    } else {
      return false;
    }

    await this.prisma.offrampProviderOrder.update({
      where: { id: order.id },
      data: { failureReason: 'timeout' },
    });

    this.logger.log(
      `[offramp-expiry] order ${order.reference} expired (failureReason=timeout)`,
    );
    return true;
  }
}
