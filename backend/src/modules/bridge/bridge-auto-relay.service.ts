import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { EvmRelayService, isStellarToBase } from './evm-relay.service';
import { StellarRelayService } from './stellar-relay.service';

const num = (name: string, fallback: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

/** A transfer in this state still has USDC sitting in a confirmed burn that nobody has minted. */
export function needsRelay(
  t: {
    status: string;
    transactionHash: string | null;
    metadata: any;
    updatedAt: Date;
  },
  now: Date,
  afterMs: number,
  windowMs: number,
): boolean {
  if (!t.transactionHash) return false;
  if (String(t.status).toUpperCase() === 'COMPLETED') return false;
  const meta = (t.metadata ?? {}) as Record<string, any>;
  if (meta.EVM_MINT_TX || meta.STELLAR_MINT_TX || meta.DESTINATION_TX)
    return false;
  const age = now.getTime() - new Date(t.updatedAt).getTime();
  return age >= afterMs && age <= windowMs;
}

/**
 * The safety net behind the user's own wallet. When a user's wallet does the mint, nothing here fires. When the wallet is closed, the
 * page is left, or the signature is never given, the burn is already on chain and the USDC is neither lost nor delivered. After a grace
 * period this finishes the transfer from the relayer (which only pays gas; the USDC goes to the recipient in the burn).
 */
@Injectable()
export class BridgeAutoRelayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BridgeAutoRelayService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly evmRelay: EvmRelayService,
    private readonly stellarRelay: StellarRelayService,
  ) {}

  onModuleInit(): void {
    if (
      (process.env.BRIDGE_AUTO_RELAY_ENABLED ?? 'true').toLowerCase() ===
      'false'
    )
      return;
    this.timer = setInterval(
      () => {
        this.sweep().catch((e) =>
          this.logger.error(
            `[bridge-auto-relay] sweep failed: ${e instanceof Error ? e.message : String(e)}`,
          ),
        );
      },
      num('BRIDGE_AUTO_RELAY_INTERVAL_MS', 120_000),
    );
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Finish what is stuck. Returns how many transfers were delivered. */
  async sweep(now = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const afterMs = num('BRIDGE_AUTO_RELAY_AFTER_MINUTES', 10) * 60_000;
      const windowMs = num('BRIDGE_AUTO_RELAY_WINDOW_DAYS', 3) * 86_400_000;
      const rows: any[] = await this.prisma.bridgeTransaction.findMany({
        where: {
          transactionHash: { not: null },
          status: { not: 'COMPLETED' },
          updatedAt: {
            gt: new Date(now.getTime() - windowMs),
            lt: new Date(now.getTime() - afterMs),
          },
        },
        orderBy: { updatedAt: 'asc' },
        take: Math.floor(num('BRIDGE_AUTO_RELAY_BATCH', 10)),
      });

      let delivered = 0;
      for (const t of rows) {
        if (!needsRelay(t, now, afterMs, windowMs)) continue;
        try {
          if (isStellarToBase(t.fromChain, t.toChain)) {
            const r = await this.evmRelay.relayTransfer(t);
            if (r.status === 'complete') delivered++;
          } else if (/stellar/i.test(t.toChain) && t.userId) {
            const sourceDomain = /ethereum/i.test(t.fromChain)
              ? 0
              : /base/i.test(t.fromChain)
                ? 6
                : null;
            if (sourceDomain === null) continue;
            const r = await this.stellarRelay.relay(
              String(t.transactionHash),
              sourceDomain,
              { userId: t.userId },
            );
            if (r.status === 'complete') delivered++;
          }
        } catch (e) {
          this.logger.warn(
            `[bridge-auto-relay] ${t.reference}: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
      if (delivered)
        this.logger.log(
          `[bridge-auto-relay] delivered ${delivered} stuck transfer(s)`,
        );
      return delivered;
    } finally {
      this.running = false;
    }
  }
}
