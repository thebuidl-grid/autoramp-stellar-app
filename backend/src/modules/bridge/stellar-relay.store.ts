import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import IORedis from 'ioredis';

const MINTED_TTL_SEC = 30 * 24 * 60 * 60;
const LOCK_TTL_SEC = 5 * 60;

/**
 * Shared state for the Stellar relay: which burns are already minted, a cross-instance
 * "mint in progress" lock, and a per-user request counter. Uses Redis (REDIS_URL); if Redis is
 * disabled (REDIS_ENABLED=false) or unreachable it degrades to process memory so the relay still
 * works on a single instance. Durable proof of a mint is also written to the bridge record.
 */
@Injectable()
export class StellarRelayStore implements OnModuleDestroy {
  private readonly logger = new Logger(StellarRelayStore.name);
  private readonly redis: IORedis | null = null;
  private readonly mem = new Map<string, { v: string; exp: number }>();

  constructor() {
    if (process.env.REDIS_ENABLED === 'false') return;
    this.redis = new IORedis(
      process.env.REDIS_URL || 'redis://localhost:6379',
      {
        maxRetriesPerRequest: 2,
        enableReadyCheck: false,
      },
    );
    this.redis.on('error', (e) =>
      this.logger.warn(`Stellar relay Redis error: ${e.message}`),
    );
  }

  onModuleDestroy() {
    this.redis?.disconnect();
  }

  private memGet(key: string): string | null {
    const e = this.mem.get(key);
    if (!e) return null;
    if (e.exp < Date.now()) {
      this.mem.delete(key);
      return null;
    }
    return e.v;
  }

  private memSet(key: string, v: string, ttlSec: number) {
    this.mem.set(key, { v, exp: Date.now() + ttlSec * 1000 });
  }

  private async safe<T>(
    redisOp: (r: IORedis) => Promise<T>,
    memOp: () => T,
  ): Promise<T> {
    if (this.redis) {
      try {
        return await redisOp(this.redis);
      } catch (e) {
        this.logger.warn(
          `Redis unavailable, using memory: ${e instanceof Error ? e.message : e}`,
        );
      }
    }
    return memOp();
  }

  private static minted = (burn: string) =>
    `stellar-relay:minted:${burn.toLowerCase()}`;
  private static lock = (burn: string) =>
    `stellar-relay:lock:${burn.toLowerCase()}`;

  getMinted(burn: string): Promise<string | null> {
    const k = StellarRelayStore.minted(burn);
    return this.safe(
      (r) => r.get(k),
      () => this.memGet(k),
    );
  }

  async setMinted(burn: string, mintTxHash: string): Promise<void> {
    const k = StellarRelayStore.minted(burn);
    await this.safe(
      (r) => r.set(k, mintTxHash, 'EX', MINTED_TTL_SEC).then(() => undefined),
      () => this.memSet(k, mintTxHash, MINTED_TTL_SEC),
    );
  }

  async isLocked(burn: string): Promise<boolean> {
    const k = StellarRelayStore.lock(burn);
    return this.safe(
      async (r) => (await r.exists(k)) === 1,
      () => this.memGet(k) !== null,
    );
  }

  /** True if this caller now holds the lock for the burn (SET NX with expiry). */
  acquireLock(burn: string): Promise<boolean> {
    const k = StellarRelayStore.lock(burn);
    return this.safe(
      async (r) => (await r.set(k, '1', 'EX', LOCK_TTL_SEC, 'NX')) === 'OK',
      () => {
        if (this.memGet(k) !== null) return false;
        this.memSet(k, '1', LOCK_TTL_SEC);
        return true;
      },
    );
  }

  async releaseLock(burn: string): Promise<void> {
    const k = StellarRelayStore.lock(burn);
    await this.safe(
      (r) => r.del(k).then(() => undefined),
      () => void this.mem.delete(k),
    );
  }

  /** Count a request for `key` in a fixed window; returns whether it is within `limit`. */
  async hit(
    key: string,
    limit: number,
    windowSec: number,
  ): Promise<{ allowed: boolean; retryAfterSec: number }> {
    const k = `stellar-relay:rl:${key}`;
    const count = await this.safe(
      async (r) => {
        const n = await r.incr(k);
        if (n === 1) await r.expire(k, windowSec);
        return n;
      },
      () => {
        const cur = Number(this.memGet(k) ?? 0) + 1;
        const existing = this.mem.get(k);
        this.mem.set(k, {
          v: String(cur),
          exp:
            existing && existing.exp > Date.now()
              ? existing.exp
              : Date.now() + windowSec * 1000,
        });
        return cur;
      },
    );
    return { allowed: count <= limit, retryAfterSec: windowSec };
  }
}
