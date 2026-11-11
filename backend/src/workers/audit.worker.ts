import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AuditModule } from '../common/services/audit.module';
import { AuditLogQueueService } from '../common/services/audit-log-queue.service';

async function bootstrap() {
  const logger = new Logger('AuditWorker');
  logger.log('Starting audit worker...');

  const app = await NestFactory.createApplicationContext(AuditModule, {
    logger: ['error', 'warn', 'log'],
  });

  app.get(AuditLogQueueService);

  logger.log('Audit worker connected to Redis. Waiting for jobs...');

  process.on('SIGTERM', async () => {
    logger.log('SIGTERM received — shutting down...');
    await app.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.log('SIGINT received — shutting down...');
    await app.close();
    process.exit(0);
  });
}

bootstrap().catch((err) => {
  console.error('Audit worker failed to start:', err);
  process.exit(1);
});
