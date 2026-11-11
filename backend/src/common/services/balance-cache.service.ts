import { Injectable, Logger } from '@nestjs/common';
import IORedis from 'ioredis';
import { PrismaService } from '../../database/prisma.service';

export interface BalanceData {
  accountBalance: number;
  bookBalance: number;
  accountName: string;
  status: string;
}

@Injectable()
export class BalanceCacheService {
  private readonly logger = new Logger(BalanceCacheService.name);
  private readonly connection: IORedis | null = null;
  private readonly enabled: boolean;

  private static readonly PREFIX = 'balance';
  private static readonly DEFAULT_TTL_MS = 60 * 1000;

  constructor() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    this.enabled = process.env.REDIS_ENABLED !== 'false';

    if (!this.enabled) {
      this.logger.log('Balance cache disabled via REDIS_ENABLED=false');
      return;
    }

    this.connection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    this.connection.on('error', (err) => {
      this.logger.error(`Balance cache Redis error: ${err.message}`);
    });

    this.connection.on('connect', () => {
      this.logger.log('Balance cache Redis connected');
    });
  }

  private key(type: 'merchant' | 'sub', id: string): string {
    return `${BalanceCacheService.PREFIX}:${type}:${id}`;
  }

  async get(type: 'merchant' | 'sub', id: string): Promise<BalanceData | null> {
    if (!this.enabled || !this.connection) return null;
    try {
      const raw = await this.connection.get(this.key(type, id));
      if (!raw) return null;
      return JSON.parse(raw) as BalanceData;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Balance cache get failed: ${message}`);
      return null;
    }
  }

  async set(
    type: 'merchant' | 'sub',
    id: string,
    data: BalanceData,
    ttlMs?: number,
  ): Promise<void> {
    if (!this.enabled || !this.connection) return;
    const ttl = Math.max(
      1,
      Math.floor((ttlMs ?? BalanceCacheService.DEFAULT_TTL_MS) / 1000),
    );
    try {
      await this.connection.setex(
        this.key(type, id),
        ttl,
        JSON.stringify(data),
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Balance cache set failed: ${message}`);
    }
  }

  async invalidate(type: 'merchant' | 'sub', id: string): Promise<void> {
    if (!this.enabled || !this.connection) return;
    try {
      await this.connection.del(this.key(type, id));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Balance cache invalidate failed: ${message}`);
    }
  }

  async invalidateAllForMerchant(
    prisma: PrismaService,
    merchantId: string,
  ): Promise<void> {
    await this.invalidate('merchant', merchantId);
    try {
      const subAccounts = await prisma.merchantSubAccount.findMany({
        where: { merchantId },
        select: { id: true },
      });
      await Promise.all(
        subAccounts.map((sa: { id: string }) => this.invalidate('sub', sa.id)),
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Balance cache invalidateAllForMerchant failed: ${message}`,
      );
    }
  }
}
