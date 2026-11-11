import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { WebhookModule } from '../modules/webhook/webhook.module';
import { WebhookQueueService } from '../modules/webhook/webhook-queue.service';
import { WebhookJobProcessor } from '../modules/webhook/webhook-job.processor';

async function bootstrap() {
  const logger = new Logger('WebhookWorker');
  logger.log('Starting webhook worker...');

  const app = await NestFactory.createApplicationContext(WebhookModule, {
    logger: ['error', 'warn', 'log'],
  });

  const queueService = app.get(WebhookQueueService);
  const processor = app.get(WebhookJobProcessor);
  queueService.setHandler(processor.createHandler());

  const concurrency = Number(process.env.WEBHOOK_WORKER_CONCURRENCY) || 3;
  logger.log(
    `[worker:started] queue=webhook-events concurrency=${concurrency} producerOnly=${process.env.WEBHOOK_QUEUE_PRODUCER_ONLY ?? 'false'} redis=${redactedRedisUrl(process.env.REDIS_URL)}`,
  );
  logger.log('[worker:waiting] connected to Redis. Waiting for jobs...');

  // Heartbeat so ops can see the worker is alive AND whether it is draining.
  const heartbeatMs = Number(process.env.WEBHOOK_WORKER_HEARTBEAT_MS) || 30000;
  const heartbeat = setInterval(async () => {
    try {
      const counts = await queueService.getCounts();
      logger.log(
        `[worker:heartbeat] queue=webhook-events depth={waiting:${counts.waiting},active:${counts.active},delayed:${counts.delayed},failed:${counts.failed}}`,
      );
    } catch (err) {
      logger.error(
        `[worker:heartbeat-failed] ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }, heartbeatMs);
  heartbeat.unref?.();

  process.on('SIGTERM', async () => {
    logger.log('[worker:shutdown] SIGTERM received — shutting down...');
    await app.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.log('[worker:shutdown] SIGINT received — shutting down...');
    await app.close();
    process.exit(0);
  });
}

function redactedRedisUrl(url: string | undefined): string {
  if (!url) return 'redis://localhost:6379 (default)';
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = '***';
    if (parsed.username) parsed.username = '***';
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return 'unparseable-redis-url';
  }
}

bootstrap().catch((err) => {
  console.error('Webhook worker failed to start:', err);
  process.exit(1);
});
