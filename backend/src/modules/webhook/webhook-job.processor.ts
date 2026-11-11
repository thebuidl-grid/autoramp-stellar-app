import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { MFBWebhookService } from '../safehaven/safehaven-webhook.service';
import { BitNobWebhookService } from '../bitnob/bitnob-webhook.service';
import { BlockRadarWebhookService } from '../blockradar/blockradar-webhook.service';
import { WebhookService } from '../ramp/webhook.service';
import { PulseMfbWebhookService } from '../pulsemfb/pulsemfb-webhook.service';
import { WebhookJobData, WebhookJobHandler } from './webhook-queue.service';

@Injectable()
export class WebhookJobProcessor {
  private readonly logger = new Logger(WebhookJobProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly safeHavenWebhookService: MFBWebhookService,
    private readonly bitNobWebhookService: BitNobWebhookService,
    private readonly blockRadarWebhookService: BlockRadarWebhookService,
    private readonly rampWebhookService: WebhookService,
    private readonly pulseMfbWebhookService: PulseMfbWebhookService,
  ) {}

  createHandler(): WebhookJobHandler {
    return (data) => this.route(data);
  }

  private async route(data: WebhookJobData): Promise<any> {
    const {
      provider,
      endpoint,
      payload,
      signature,
      inboundWebhookId,
      receivedAt,
    } = data;
    const startedAt = Date.now();
    const waitMs = receivedAt
      ? Date.now() - new Date(receivedAt).getTime()
      : -1;

    this.logger.log(
      `[processor:start] provider=${provider} endpoint=${endpoint} inboundWebhookId=${inboundWebhookId ?? 'none'} queueWaitMs=${waitMs} transition=pending->processing`,
    );

    if (inboundWebhookId) {
      await this.prisma.inboundWebhook.update({
        where: { id: inboundWebhookId },
        data: { status: 'processing' },
      });
      this.logger.log(
        `[processor:status] inboundWebhookId=${inboundWebhookId} status=processing`,
      );
    }

    try {
      let result: any;
      switch (provider) {
        case 'safehaven':
          result = await this.safeHavenWebhookService.processWebhook(payload);
          break;
        case 'bitnob':
          result = await this.bitNobWebhookService.processWebhook(payload);
          break;
        case 'blockradar':
          result = await this.blockRadarWebhookService.processWebhook(payload);
          break;
        case 'flint':
          result = await this.rampWebhookService.processWebhook(payload);
          break;
        case 'pulse':
          result = await this.pulseMfbWebhookService.processWebhook(
            payload,
            signature,
          );
          break;
        default:
          this.logger.warn(`Unknown webhook provider: ${provider}`);
          result = {
            status: 'ignored',
            message: `Unknown provider: ${provider}`,
          };
      }

      if (inboundWebhookId) {
        await this.prisma.inboundWebhook.update({
          where: { id: inboundWebhookId },
          data: { status: 'completed', processedAt: new Date() },
        });
      }

      this.logger.log(
        `[processor:done] provider=${provider} endpoint=${endpoint} inboundWebhookId=${inboundWebhookId ?? 'none'} transition=processing->completed durationMs=${Date.now() - startedAt}`,
      );

      return result;
    } catch (err) {
      this.logger.error(
        `[processor:failed] provider=${provider} endpoint=${endpoint} inboundWebhookId=${inboundWebhookId ?? 'none'} transition=processing->failed durationMs=${Date.now() - startedAt} error=${err instanceof Error ? err.message : String(err)}${err instanceof Error && err.stack ? `\n${err.stack}` : ''}`,
      );
      if (inboundWebhookId) {
        await this.prisma.inboundWebhook.update({
          where: { id: inboundWebhookId },
          data: {
            status: 'failed',
            error: err instanceof Error ? err.message : String(err),
            processedAt: new Date(),
          },
        });
      }
      throw err;
    }
  }
}
