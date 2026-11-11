import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';

export type WebhookProvider =
  | 'safehaven'
  | 'bitnob'
  | 'blockradar'
  | 'flint'
  | 'pulse';

export interface WebhookJobData {
  provider: WebhookProvider;
  endpoint: string;
  payload: any;
  signature?: string;
  inboundWebhookId?: string;
  receivedAt: string;
}

export type WebhookJobHandler = (data: WebhookJobData) => Promise<any>;

@Injectable()
export class WebhookQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(WebhookQueueService.name);

  private readonly connection: IORedis;
  private readonly workerConnection: IORedis | null;
  private readonly queue: Queue<WebhookJobData>;
  private readonly worker: Worker<WebhookJobData> | null;

  private handler: WebhookJobHandler | null = null;

  private static readonly QUEUE_NAME = 'webhook-events';

  constructor() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const concurrency = Number(process.env.WEBHOOK_WORKER_CONCURRENCY) || 3;
    // Default: this process both enqueues AND processes jobs, so webhooks
    // keep flowing even when no standalone `npm run worker:*` is deployed.
    // Set WEBHOOK_QUEUE_PRODUCER_ONLY=true to make this instance enqueue-only.
    const producerOnly = process.env.WEBHOOK_QUEUE_PRODUCER_ONLY === 'true';

    this.connection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    this.connection.on('error', (err) => {
      this.logger.error(`Redis connection error: ${err.message}`);
    });

    this.connection.on('connect', () => {
      this.logger.log('Redis connected for webhook queue');
    });

    this.queue = new Queue<WebhookJobData>(WebhookQueueService.QUEUE_NAME, {
      connection: this.connection,
      defaultJobOptions: {
        removeOnComplete: { age: 86400, count: 5000 },
        removeOnFail: { age: 604800, count: 2000 },
        attempts: 5,
        backoff: { type: 'exponential', delay: 3000 },
      },
    });

    if (producerOnly) {
      this.workerConnection = null;
      this.worker = null;
      this.logger.log(
        'Webhook queue ready (producer only — WEBHOOK_QUEUE_PRODUCER_ONLY=true)',
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
      this.logger.error(`[queue:redis-worker-error] ${err.message}`);
    });

    this.workerConnection.on('connect', () => {
      this.logger.log(
        '[queue:redis-worker-connected] worker Redis connection ready',
      );
    });

    this.worker = new Worker<WebhookJobData>(
      WebhookQueueService.QUEUE_NAME,
      (job) => this.processJob(job),
      { connection: this.workerConnection, concurrency },
    );

    this.worker.on('active', (job) => {
      this.logger.log(
        `[queue:picked-up] jobId=${job.id} provider=${job.data.provider} endpoint=${job.data.endpoint} inboundWebhookId=${job.data.inboundWebhookId ?? 'none'} attempt=${job.attemptsMade + 1}`,
      );
    });

    this.worker.on('completed', (job) => {
      this.logger.log(
        `[queue:completed] jobId=${job.id} provider=${job.data.provider} endpoint=${job.data.endpoint} inboundWebhookId=${job.data.inboundWebhookId ?? 'none'}`,
      );
    });

    this.worker.on('failed', (job, err) => {
      this.logger.error(
        `[queue:failed] jobId=${job?.id} provider=${job?.data.provider} endpoint=${job?.data.endpoint} inboundWebhookId=${job?.data.inboundWebhookId ?? 'none'} attemptsMade=${job?.attemptsMade} error=${err?.message}`,
      );
    });

    this.worker.on('stalled', (jobId) => {
      this.logger.warn(
        `[queue:stalled] jobId=${jobId} stalled — will be retried`,
      );
    });

    this.worker.on('paused', () => {
      this.logger.warn(
        '[queue:paused] worker paused — NOT picking up new jobs',
      );
    });

    this.worker.on('resumed', () => {
      this.logger.log('[queue:resumed] worker resumed — picking up jobs again');
    });

    this.worker.on('closed', () => {
      this.logger.warn('[queue:closed] worker closed');
    });

    this.worker.on('error', (err) => {
      this.logger.error(`[queue:worker-error] ${err.message}`);
    });

    this.worker.on('ready', () => {
      this.logger.log(
        `[queue:worker-ready] listening on queue="${WebhookQueueService.QUEUE_NAME}" concurrency=${concurrency}`,
      );
    });

    this.logger.log(
      `Webhook queue ready (concurrency=${concurrency}). Processing jobs in this process.`,
    );
  }

  setHandler(handler: WebhookJobHandler): void {
    this.handler = handler;
    this.logger.log(
      `[queue:handler-registered] jobs will now be processed in this process (handler set)`,
    );
  }

  /** True when this instance only enqueues (WEBHOOK_QUEUE_PRODUCER_ONLY=true). */
  get isProducerOnly(): boolean {
    return this.worker === null;
  }

  async enqueue(data: WebhookJobData): Promise<void> {
    // Each inbound webhook row must be processed exactly once. Using the
    // inboundWebhookId as jobId gives idempotent retries of the same row
    // without dropping legitimate provider retries (which create a NEW row
    // with a NEW id but may carry an identical payload).
    const jobId = data.inboundWebhookId
      ? `webhook-${data.inboundWebhookId}`
      : undefined;

    this.logger.log(
      `[queue:enqueue] provider=${data.provider} endpoint=${data.endpoint} inboundWebhookId=${data.inboundWebhookId ?? 'none'} jobId=${jobId ?? 'auto'} receivedAt=${data.receivedAt}`,
    );
    try {
      const job = await this.queue.add('webhook', data, jobId ? { jobId } : {});
      const counts = await this.getCounts().catch(() => null);
      this.logger.log(
        `[queue:enqueued] jobId=${job.id} provider=${data.provider} endpoint=${data.endpoint} inboundWebhookId=${data.inboundWebhookId ?? 'none'}` +
          (counts
            ? ` queueDepth={waiting:${counts.waiting},active:${counts.active},delayed:${counts.delayed},failed:${counts.failed}}`
            : ''),
      );
    } catch (err) {
      this.logger.error(
        `[queue:enqueue-failed] provider=${data.provider} endpoint=${data.endpoint} inboundWebhookId=${data.inboundWebhookId ?? 'none'} error=${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }
  }

  async getCounts(): Promise<{
    waiting: number;
    active: number;
    delayed: number;
    failed: number;
  }> {
    const [waiting, active, delayed, failed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getDelayedCount(),
      this.queue.getFailedCount(),
    ]);
    return { waiting, active, delayed, failed };
  }

  private async processJob(job: Job<WebhookJobData>): Promise<any> {
    const startedAt = Date.now();
    if (!this.handler) {
      this.logger.error(
        `[queue:no-handler] jobId=${job.id} — no handler registered, job will be retried`,
      );
      throw new Error('No webhook handler registered');
    }
    this.logger.log(
      `[queue:processing] jobId=${job.id} provider=${job.data.provider} endpoint=${job.data.endpoint} inboundWebhookId=${job.data.inboundWebhookId ?? 'none'}`,
    );
    try {
      const result = await this.handler(job.data);
      this.logger.log(
        `[queue:processed] jobId=${job.id} provider=${job.data.provider} endpoint=${job.data.endpoint} inboundWebhookId=${job.data.inboundWebhookId ?? 'none'} durationMs=${Date.now() - startedAt}`,
      );
      return result;
    } catch (err) {
      this.logger.error(
        `[queue:processing-failed] jobId=${job.id} provider=${job.data.provider} endpoint=${job.data.endpoint} inboundWebhookId=${job.data.inboundWebhookId ?? 'none'} durationMs=${Date.now() - startedAt} error=${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('[queue:shutdown] shutting down webhook queue...');
    if (this.worker) await this.worker.close();
    await this.queue.close();
    if (this.workerConnection) await this.workerConnection.quit();
    await this.connection.quit();
    this.logger.log('[queue:shutdown] webhook queue shut down');
  }
}
