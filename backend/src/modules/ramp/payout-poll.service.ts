import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { BitNobService } from '../bitnob/bitnob.service';
import { BitNobWebhookService } from '../bitnob/bitnob-webhook.service';
import { PayoutOrderRepository } from './payout-order.repository';

/**
 * Asks Bitnob what really happened to a payout, instead of waiting for a webhook that may be late, lost or never sent.
 *
 * Why: some KES payouts were paid and the customer received the money, but we had already marked the order expired (our timeout ran
 * out first) or failed, and a missed "settled" webhook meant we never learned otherwise. The provider's own status is the truth about
 * whether the customer was paid, so we poll it, apply it through the same path a webhook takes, and let a provider-confirmed
 * "settled" recover an order we wrongly gave up on.
 */

export type PollOutcome =
  /** Bitnob's status changed our order. */
  | 'applied'
  /** Bitnob answered and there was nothing to change. */
  | 'unchanged'
  /** We could not get a usable answer. Callers must not conclude anything from it. */
  | 'unreachable'
  /** The order never reached Bitnob (no payout id), so there is nothing to ask. */
  | 'no_provider';

export interface PollResult {
  outcome: PollOutcome;
  /** Bitnob's own status word, when it answered. */
  providerStatus?: string;
}

/** Our statuses that are settled for good. */
const SETTLED_FOR_GOOD = ['COMPLETED', 'REVERSED', 'REFUNDED'];
const GAVE_UP = ['FAILED', 'REJECTED', 'EXPIRED', 'CANCELLED', 'DISPUTED'];
const BEFORE_PAYOUT = [
  'PENDING',
  'INITIATED',
  'AWAITING_DEPOSIT',
  'DEPOSIT_DETECTED',
];

/** What we poll: everything still moving, plus the "gave up" states, because a provider "settled" can overturn those. */
export const POLLABLE_STATUSES = [
  'PENDING',
  'INITIATED',
  'AWAITING_DEPOSIT',
  'DEPOSIT_DETECTED',
  'PROCESSING',
  'CONVERSION_PENDING',
  'PAYOUT_PENDING',
  'PARTIALLY_SETTLED',
  'INSUFFICIENT_LIQUIDITY',
  'FAILED',
  'REJECTED',
  'EXPIRED',
];

/**
 * Pure: is Bitnob's status news compared with ours? Only then is the update applied, so polling an unchanged order is silent.
 * Bitnob's payout statuses: QUOTE, INITIATED, PENDING, PENDING_ADDRESS_DEPOSIT, PROCESSING, SUCCESS, FAILED, EXPIRED, UNDERPAYMENT.
 */
export function isPayoutNews(
  providerStatus: string | null | undefined,
  ourStatus: string | null | undefined,
): boolean {
  const p = String(providerStatus ?? '')
    .trim()
    .toUpperCase();
  const ours = String(ourStatus ?? '')
    .trim()
    .toUpperCase();
  if (!p || !ours) return false;
  if (p === 'SUCCESS' || p === 'COMPLETED' || p === 'SETTLED')
    return !SETTLED_FOR_GOOD.includes(ours);
  if (p === 'FAILED')
    return !SETTLED_FOR_GOOD.includes(ours) && !GAVE_UP.includes(ours);
  if (p === 'EXPIRED')
    return !SETTLED_FOR_GOOD.includes(ours) && !GAVE_UP.includes(ours);
  if (p === 'UNDERPAYMENT')
    return (
      !SETTLED_FOR_GOOD.includes(ours) &&
      !GAVE_UP.includes(ours) &&
      ours !== 'PARTIALLY_SETTLED'
    );
  if (p === 'PROCESSING') return BEFORE_PAYOUT.includes(ours);
  return false; // QUOTE, INITIATED, PENDING, PENDING_ADDRESS_DEPOSIT, anything new: nothing to learn
}

/** A Bitnob payout id is a UUID. Until Bitnob reports one, an order holds its quote id (QT2_...), which cannot be looked up as a payout. */
export const isBitnobPayoutId = (id: string | null | undefined): id is string =>
  typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

/** Bitnob wraps a payout as `{ data: { payout: {...} } }`; tolerate the flatter shapes too. */
export function extractPayout(res: any): any {
  return res?.data?.payout ?? res?.payout ?? res?.data ?? res ?? null;
}

const envNumber = (name: string, fallback: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

@Injectable()
export class PayoutPollService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PayoutPollService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => BitNobService))
    private readonly bitnob: BitNobService,
    @Inject(forwardRef(() => BitNobWebhookService))
    private readonly webhooks: BitNobWebhookService,
    private readonly payoutOrders: PayoutOrderRepository,
  ) {}

  onModuleInit(): void {
    if ((process.env.PAYOUT_POLL_ENABLED ?? 'true').toLowerCase() === 'false')
      return;
    this.timer = setInterval(
      () => {
        this.sweep().catch((err) =>
          this.logger.error(
            `[payout-poll] sweep failed: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
      },
      envNumber('PAYOUT_POLL_INTERVAL_MS', 120_000),
    );
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * Ask Bitnob about one order and apply what it says. `ourStatus` is what we currently believe, so unchanged orders are skipped
   * without writing anything.
   */
  async pollOrder(input: {
    reference: string;
    providerOrderId: string | null | undefined;
    ourStatus: string;
  }): Promise<PollResult> {
    // We have our own reference once the Bitnob quote exists. Lookup by reference also works
    // before Bitnob has supplied a UUID, and lets polling recover when payout webhooks are missed.
    if (!input.providerOrderId || !input.reference) return { outcome: 'no_provider' };

    let payout: any;
    try {
      payout = extractPayout(
        await this.bitnob.getPayoutByReference(input.reference),
      );
    } catch (error: any) {
      this.logger.warn(
        `[payout-poll] Bitnob lookup failed for ${input.reference}: ${error?.message ?? error}`,
      );
      return { outcome: 'unreachable' };
    }
    const providerStatus = String(payout?.status ?? '').trim();
    if (!providerStatus) return { outcome: 'unreachable' }; // an answer with no status tells us nothing

    if (!isPayoutNews(providerStatus, input.ourStatus))
      return { outcome: 'unchanged', providerStatus };

    try {
      const out: any = await this.webhooks.processWebhook({
        event: `payouts.${providerStatus.toLowerCase()}`,
        data: {
          ...payout,
          id: payout?.id ?? input.providerOrderId,
          reference: payout?.reference ?? input.reference,
        },
      });
      const applied =
        !!out?.status && !['ignored', 'duplicate'].includes(out.status);
      if (applied)
        this.logger.log(
          `[payout-poll] ${input.reference}: Bitnob says ${providerStatus}, we had ${input.ourStatus}; updated`,
        );
      return { outcome: applied ? 'applied' : 'unchanged', providerStatus };
    } catch (error: any) {
      this.logger.warn(
        `[payout-poll] applying ${providerStatus} to ${input.reference} failed: ${error?.message ?? error}`,
      );
      return { outcome: 'unreachable', providerStatus };
    }
  }

  /** Poll the order behind one transaction (user or merchant off-ramp). Used by the expiry sweeper before it gives up on an order. */
  async pollTransaction(
    transactionId: string,
    ourStatus: string,
  ): Promise<PollResult> {
    const order = await this.payoutOrders.findByTransactionId(transactionId);
    if (!order) return { outcome: 'no_provider' };
    return this.pollOrder({
      reference: order.reference,
      providerOrderId: order.providerOrderId,
      ourStatus,
    });
  }

  /** Poll every recent off-ramp that could still change, oldest first, a bounded number per run. Returns how many were updated. */
  async sweep(now = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const windowMs = envNumber('PAYOUT_POLL_WINDOW_DAYS', 14) * 86_400_000;
      const batch = Math.floor(envNumber('PAYOUT_POLL_BATCH', 40));
      const since = new Date(now.getTime() - windowMs);

      const where = {
        status: { in: POLLABLE_STATUSES as any },
        updatedAt: { gt: since },
      };
      const [users, merchants] = await Promise.all([
        (this.prisma as any).offrampTransaction.findMany({
          where,
          orderBy: { updatedAt: 'asc' },
          take: batch,
        }),
        (this.prisma as any).merchantOfframpTransaction.findMany({
          where,
          orderBy: { updatedAt: 'asc' },
          take: batch,
        }),
      ]);
      const candidates = [...users, ...merchants]
        .sort(
          (a: any, b: any) =>
            new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime(),
        )
        .slice(0, batch);

      let updated = 0;
      for (const tx of candidates) {
        const result = await this.pollTransaction(tx.id, String(tx.status));
        if (result.outcome === 'applied') updated++;
      }
      return updated;
    } finally {
      this.running = false;
    }
  }
}
