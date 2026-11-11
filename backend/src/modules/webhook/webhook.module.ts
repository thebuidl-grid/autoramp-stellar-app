import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { WebhookJobData, WebhookQueueService } from './webhook-queue.service';
import { WebhookJobProcessor } from './webhook-job.processor';
import { PrismaService } from '../../database/prisma.service';
import { RampModule } from '../ramp/ramp.module';
import { AuthModule } from '../auth/auth.module';
import { SharedModule } from '../../shared/shared.module';
import { BitNobModule } from '../bitnob/bitnob.module';
import { BlockRadarModule } from '../blockradar/blockradar.module';
import { PulseMfbModule } from '../pulsemfb/pulsemfb.module';
import { NotificationsModule } from '../merchants/notifications/notifications.module';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [
    DatabaseModule,
    RampModule,
    AuthModule,
    SharedModule,
    BitNobModule,
    BlockRadarModule,
    PulseMfbModule,
    NotificationsModule,
  ],
  controllers: [WebhookController],
  providers: [WebhookQueueService, WebhookJobProcessor],
  exports: [WebhookQueueService],
})
export class WebhookModule implements OnModuleInit {
  private readonly logger = new Logger(WebhookModule.name);

  constructor(
    private readonly queueService: WebhookQueueService,
    private readonly processor: WebhookJobProcessor,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    this.queueService.setHandler(this.processor.createHandler());
    await this.drainStuckBacklog();
  }

  /**
   * On boot, re-queue inbound webhooks stuck in `pending`/`processing`
   * (e.g. saved while no worker was consuming). BullMQ jobs still waiting
   * in Redis are picked up automatically by the Worker; this covers rows
   * whose queue jobs were lost or never enqueued, so SafeHaven and other
   * provider backlogs start processing ASAP after a restart.
   */
  private async drainStuckBacklog(): Promise<void> {
    if (this.queueService.isProducerOnly) {
      this.logger.log(
        '[recovery:skipped] producer-only mode — the standalone worker will drain the backlog',
      );
      return;
    }
    if (process.env.WEBHOOK_RECOVERY_ENABLED === 'false') {
      this.logger.log('[recovery:skipped] WEBHOOK_RECOVERY_ENABLED=false');
      return;
    }

    const limit = Number(process.env.WEBHOOK_RECOVERY_LIMIT) || 500;

    let stuck: Array<{
      id: string;
      provider: string;
      endpoint: string;
      payload: unknown;
      signature: string | null;
      receivedAt: Date;
    }>;
    try {
      stuck = await this.prisma.inboundWebhook.findMany({
        where: { status: { in: ['pending', 'processing'] } },
        orderBy: { receivedAt: 'asc' },
        take: limit,
        select: {
          id: true,
          provider: true,
          endpoint: true,
          payload: true,
          signature: true,
          receivedAt: true,
        },
      });
    } catch (err) {
      this.logger.warn(
        `[recovery:db-unavailable] could not load stuck webhooks: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }

    if (stuck.length === 0) {
      this.logger.log(
        '[recovery:empty] no pending/processing inbound webhooks — nothing to re-queue',
      );
      return;
    }

    const perProvider: Record<string, number> = {};
    for (const row of stuck) {
      perProvider[row.provider] = (perProvider[row.provider] ?? 0) + 1;
    }
    this.logger.log(
      `[recovery:start] re-queueing ${stuck.length} stuck webhook(s) perProvider=${JSON.stringify(perProvider)}`,
    );

    let enqueued = 0;
    let skipped = 0;
    let failed = 0;
    for (const row of stuck) {
      const job: WebhookJobData = {
        provider: row.provider as WebhookJobData['provider'],
        endpoint: row.endpoint,
        payload: row.payload,
        signature: row.signature ?? undefined,
        inboundWebhookId: row.id,
        receivedAt:
          row.receivedAt instanceof Date
            ? row.receivedAt.toISOString()
            : new Date().toISOString(),
      };
      try {
        await this.queueService.enqueue(job);
        enqueued++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/already exists|duplicate/i.test(msg)) {
          // Same inboundWebhookId already has a live job in Redis — nothing to do.
          skipped++;
        } else {
          failed++;
          this.logger.warn(
            `[recovery:requeue-failed] inboundWebhookId=${row.id} provider=${row.provider} error=${msg}`,
          );
        }
      }
    }

    this.logger.log(
      `[recovery:done] enqueued=${enqueued} alreadyQueued=${skipped} failed=${failed} — backlog draining ASAP`,
    );
  }
}
