import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { BridgeService } from './bridge.service';

/**
 * Bridge states that are still open: a transfer in one of these has not
 * reached a final outcome and is eligible for abandon reconciliation. Only
 * PENDING is written now; the others are legacy rows from before bridge
 * transfers were reduced to PENDING / COMPLETED / FAILED.
 */
const OPEN_BRIDGE_STATUSES: readonly string[] = [
  'PENDING',
  'PROCESSING',
  'WAITING',
  'DELAYED',
  'STUCK',
];

function envMs(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

/**
 * Reconciles abandoned or long-running bridge transfers so the off-ramp
 * funding order is never held open forever when the wallet-signed client dies
 * mid-bridge (bridge bookkeeping is client-driven, so the backend must step in).
 *
 * The threshold is measured from the last write (`updatedAt`), which each
 * `/bridge/update-hash` progress report resets. A transfer stays PENDING until
 * `BRIDGE_ABANDON_AFTER_MS`, then becomes FAILED (allows the payout to expire).
 * There are no intermediate delayed/stuck states.
 *
 * A later DESTINATION_TX report still recovers a FAILED transfer to COMPLETED.
 * Runs in-process on a fixed interval (mirrors OfframpExpiryService); there is
 * no separate worker.
 */
@Injectable()
export class BridgeReconciliationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BridgeReconciliationService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly bridgeService: BridgeService,
  ) {}

  private get abandonAfterMs(): number {
    return envMs('BRIDGE_ABANDON_AFTER_MS', 6 * 60 * 60 * 1000);
  }

  onModuleInit(): void {
    const intervalMs = envMs('BRIDGE_RECONCILE_INTERVAL_MS', 60_000);
    this.timer = setInterval(() => {
      this.sweep().catch((err) => {
        this.logger.error(
          `[bridge-reconcile] sweep failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }, intervalMs);
    this.timer.unref?.();

    this.sweep().catch((err) => {
      this.logger.error(
        `[bridge-reconcile] boot sweep failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Downgrade stale open transfers. Returns how many were reconciled. */
  async sweep(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const now = Date.now();
      const cutoff = new Date(now - this.abandonAfterMs);

      const stale = await this.prisma.bridgeTransaction.findMany({
        where: {
          status: { in: [...OPEN_BRIDGE_STATUSES] },
          updatedAt: { lt: cutoff },
        },
        select: {
          reference: true,
          status: true,
          offrampReference: true,
          updatedAt: true,
          metadata: true,
        },
      });

      let reconciled = 0;
      for (const tx of stale) {
        const age = now - new Date(tx.updatedAt).getTime();
        const target = 'FAILED';

        const currentMetadata = (tx.metadata as Record<string, unknown>) || {};
        await this.prisma.bridgeTransaction.update({
          where: { reference: tx.reference },
          data: {
            status: target,
            metadata: {
              ...currentMetadata,
              reconciliation: {
                status: target,
                reconciledAt: new Date().toISOString(),
                reason: 'timeout',
              },
            },
          },
        });

        await this.bridgeService.mirrorBridgeStatusToOfframp(
          tx.offrampReference,
          target,
        );

        this.logger.log(
          JSON.stringify({
            event: 'bridge_reconciled',
            reference: tx.reference,
            previousStatus: tx.status,
            status: target,
            ageMs: age,
            offrampReference: tx.offrampReference,
          }),
        );
        reconciled++;
      }

      if (reconciled > 0) {
        this.logger.log(`[bridge-reconcile] reconciled ${reconciled} transfer(s)`);
      }
      return reconciled;
    } finally {
      this.running = false;
    }
  }
}
