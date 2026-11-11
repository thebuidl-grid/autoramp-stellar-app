import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaService } from '../../database/prisma.service';

export interface QueuedAuditLog {
  merchantId: string;
  action: string;
  provider?: string;
  endpoint: string;
  method: string;
  request?: any;
  response?: any;
  statusCode?: number;
  duration?: number;
  success?: boolean;
  errorMessage?: string;
}

@Injectable()
export class AuditLogQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(AuditLogQueueService.name);

  private readonly connection: IORedis;
  private readonly workerConnection: IORedis | null;
  private readonly queue: Queue<QueuedAuditLog>;
  private readonly worker: Worker<QueuedAuditLog> | null;

  private static readonly QUEUE_NAME = 'audit-logs';
  private static readonly UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  constructor(private readonly prisma: PrismaService) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const producerOnly = process.env.AUDIT_QUEUE_PRODUCER_ONLY === 'true';

    this.connection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    this.connection.on('error', (err) => {
      this.logger.error(`Redis connection error: ${err.message}`);
    });

    this.connection.on('connect', () => {
      this.logger.log('Redis connected for audit queue');
    });

    this.queue = new Queue<QueuedAuditLog>(AuditLogQueueService.QUEUE_NAME, {
      connection: this.connection,
      defaultJobOptions: {
        removeOnComplete: { age: 3600, count: 1000 },
        removeOnFail: { age: 86400, count: 500 },
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      },
    });

    if (producerOnly) {
      this.workerConnection = null;
      this.worker = null;
      this.logger.log(
        'Audit queue ready (producer only — AUDIT_QUEUE_PRODUCER_ONLY=true)',
      );
      return;
    }

    // BullMQ Workers use blocking Redis commands, so they need a dedicated
    // connection — never share the Queue's connection.
    this.workerConnection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    this.workerConnection.on('error', (err) => {
      this.logger.error(`[audit-queue:redis-worker-error] ${err.message}`);
    });

    this.worker = new Worker<QueuedAuditLog>(
      AuditLogQueueService.QUEUE_NAME,
      (job) => this.processJob(job),
      { connection: this.workerConnection, concurrency: 5 },
    );

    this.worker.on('completed', (job) => {
      this.logger.debug(`[audit-queue:completed] jobId=${job.id}`);
    });

    this.worker.on('failed', (job, err) => {
      this.logger.error(
        `[audit-queue:failed] jobId=${job?.id} error=${err?.message}`,
      );
    });

    this.worker.on('error', (err) => {
      this.logger.error(`[audit-queue:worker-error] ${err.message}`);
    });

    this.logger.log(
      'Audit queue ready (producer + worker — processing jobs in this process).',
    );
  }

  enqueue(data: QueuedAuditLog): void {
    if (
      !data.merchantId ||
      !AuditLogQueueService.UUID_RE.test(data.merchantId)
    ) {
      return;
    }

    this.queue.add('audit', data).catch((err) => {
      this.logger.error(`Failed to enqueue audit log: ${err.message}`);
    });
  }

  private async processJob(job: Job<QueuedAuditLog>): Promise<void> {
    const d = job.data;
    try {
      await this.prisma.merchantAuditLog.create({
        data: {
          merchantId: d.merchantId,
          action: d.action,
          provider: d.provider ?? null,
          endpoint: d.endpoint,
          method: d.method,
          request: d.request ?? undefined,
          response: d.response ?? undefined,
          statusCode: d.statusCode ?? null,
          duration: d.duration ?? null,
          success: d.success ?? true,
          errorMessage: d.errorMessage ?? null,
        } as any,
      });
    } catch (err) {
      this.logger.error(
        `[audit-queue:write-failed] jobId=${job.id} error=${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Shutting down audit queue...');
    if (this.worker) await this.worker.close();
    await this.queue.close();
    if (this.workerConnection) await this.workerConnection.quit();
    await this.connection.quit();
    this.logger.log('Audit queue shut down');
  }
}
