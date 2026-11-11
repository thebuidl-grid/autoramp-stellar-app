import {
  Controller,
  Post,
  Body,
  Headers,
  Logger,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { WebhookJobData, WebhookQueueService } from './webhook-queue.service';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '@prisma/client';
import { verifyBitnobSignature } from '../bitnob/bitnob-webhook.service';

@ApiTags('Webhook')
@Controller('webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly webhookQueue: WebhookQueueService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  private async getProviderWebhookId(
    provider: string,
    payload: any,
  ): Promise<string | null> {
    if (!payload || typeof payload !== 'object') return null;

    // Extract provider-specific webhook ID for idempotency
    switch (provider) {
      case 'safehaven':
        // SafeHaven uses paymentReference as the unique identifier
        const shRef =
          payload?.data?.paymentReference || payload?.paymentReference;
        if (shRef) return String(shRef);
        break;

      case 'bitnob':
      case 'flint':
        // Bitnob/Flint use reference or transactionId
        const ref = payload?.data?.reference || payload?.data?.transactionId;
        if (ref) return String(ref);
        break;

      case 'pulse':
        // Pulse MFB webhook
        const pulseRef =
          payload?.data?.reference || payload?.data?.transactionId;
        if (pulseRef) return String(pulseRef);
        break;

      case 'blockradar':
        // BlockRadar webhook - try various fields
        const brRef =
          payload?.data?.reference ||
          payload?.data?.transactionId ||
          payload?.data?.webhookId;
        if (brRef) return String(brRef);
        break;

      default:
        break;
    }

    return null;
  }

  private async isWebhookAlreadyProcessed(
    provider: string,
    providerWebhookId: string,
  ): Promise<boolean> {
    // Check if a webhook with the same provider + providerWebhookId + completed status already exists
    const existing = await this.prisma.inboundWebhook.findFirst({
      where: {
        provider,
        providerWebhookId,
        status: 'completed',
      },
    });
    return !!existing;
  }

  private async saveWebhook(
    provider: string,
    endpoint: string,
    payload: any,
    signature?: string,
  ) {
    const providerWebhookId = await this.getProviderWebhookId(
      provider,
      payload,
    );

    const data: Prisma.InboundWebhookCreateInput = {
      provider,
      endpoint,
      payload,
      signature: signature || null,
      status: 'pending',
    };

    if (providerWebhookId) {
      data.providerWebhookId = providerWebhookId;
    }

    return this.prisma.inboundWebhook.create({
      data,
    });
  }

  private async enqueueOrFail(
    recordId: string,
    job: WebhookJobData,
    providerWebhookId: string | undefined,
  ) {
    // Idempotency check: if a webhook with the same provider + providerWebhookId + completed status
    // already exists, skip enqueueing and return the existing record
    if (providerWebhookId) {
      const alreadyProcessed = await this.isWebhookAlreadyProcessed(
        job.provider,
        providerWebhookId,
      );
      if (alreadyProcessed) {
        this.logger.log(
          `[webhook:idempotent] provider=${job.provider} providerWebhookId=${providerWebhookId} already completed, skipping enqueue`,
        );
        // Return the existing completed webhook record
        const existing = await this.prisma.inboundWebhook.findFirst({
          where: {
            provider: job.provider,
            providerWebhookId,
            status: 'completed',
          },
          orderBy: { receivedAt: 'desc' },
        });
        return {
          status: 'already_processed',
          id: existing?.id,
          message: 'Webhook already processed',
        };
      }
    }

    this.logger.log(
      `[webhook:enqueueing] provider=${job.provider} endpoint=${job.endpoint} inboundWebhookId=${recordId}`,
    );
    try {
      await this.webhookQueue.enqueue(job);
      this.logger.log(
        `[webhook:enqueued] provider=${job.provider} endpoint=${job.endpoint} inboundWebhookId=${recordId} -> queue=webhook-events jobId=webhook-${recordId}`,
      );
    } catch (err) {
      this.logger.error(
        `[webhook:enqueue-failed] provider=${job.provider} endpoint=${job.endpoint} inboundWebhookId=${recordId} error=${err instanceof Error ? err.message : String(err)}`,
      );
      await this.prisma.inboundWebhook
        .update({
          where: { id: recordId },
          data: {
            status: 'failed',
            error: `enqueue failed: ${err instanceof Error ? err.message : String(err)}`,
          },
        })
        .catch(() => undefined);
      throw err;
    }
  }

  @Post('sh')
  @Public()
  @ApiOperation({ summary: 'Receive MFB webhook' })
  @ApiBody({ type: Object })
  @ApiResponse({ status: 200, description: 'Webhook accepted' })
  async handleMFBWebhook(@Body() webhookData: any) {
    this.logger.log(
      `[webhook:received] provider=safehaven endpoint=sh keys=${this.payloadKeys(webhookData)}`,
    );
    const record = await this.saveWebhook('safehaven', 'sh', webhookData);
    this.logger.log(
      `[webhook:saved] provider=safehaven endpoint=sh inboundWebhookId=${record.id} status=pending`,
    );
    await this.enqueueOrFail(
      record.id,
      {
        provider: 'safehaven',
        endpoint: 'sh',
        payload: webhookData,
        inboundWebhookId: record.id,
        receivedAt: new Date().toISOString(),
      },
      record.providerWebhookId as string | undefined,
    );
    return { status: 'accepted', id: record.id };
  }

  @Post('bitnob')
  @Public()
  @ApiOperation({ summary: 'Receive webhook from BitNob API' })
  @ApiBody({ type: Object })
  @ApiResponse({ status: 200, description: 'Webhook accepted' })
  @ApiResponse({ status: 401, description: 'Invalid webhook signature' })
  async handleBitNobWebhook(
    @Body() webhookData: any,
    @Req() req: any,
    @Headers('x-bitnob-signature') signature?: string,
  ) {
    const secret = this.configService.get<string>('BITNOB_WEBHOOK_SECRET');
    const rawBody: Buffer | undefined = req?.rawBody;
    if (!verifyBitnobSignature(rawBody, signature, secret)) {
      this.logger.warn(
        `[webhook:rejected] provider=bitnob endpoint=bitnob reason=invalid_signature`,
      );
      throw new UnauthorizedException('Invalid Bitnob webhook signature');
    }

    this.logger.log(
      `[webhook:received] provider=bitnob endpoint=bitnob keys=${this.payloadKeys(webhookData)}`,
    );
    const record = await this.saveWebhook(
      'bitnob',
      'bitnob',
      webhookData,
      signature,
    );
    this.logger.log(
      `[webhook:saved] provider=bitnob endpoint=bitnob inboundWebhookId=${record.id} status=pending`,
    );
    await this.enqueueOrFail(
      record.id,
      {
        provider: 'bitnob',
        endpoint: 'bitnob',
        payload: webhookData,
        signature,
        inboundWebhookId: record.id,
        receivedAt: new Date().toISOString(),
      },
      record.providerWebhookId as string | undefined,
    );
    return { status: 'accepted', id: record.id };
  }

  @Post('blockradar')
  @Public()
  @ApiOperation({ summary: 'Receive webhook from BlockRadar API' })
  @ApiBody({ type: Object })
  @ApiResponse({ status: 200, description: 'Webhook accepted' })
  async handleBlockRadarWebhook(@Body() webhookData: any) {
    this.logger.log(
      `[webhook:received] provider=blockradar endpoint=blockradar keys=${this.payloadKeys(webhookData)}`,
    );
    const record = await this.saveWebhook(
      'blockradar',
      'blockradar',
      webhookData,
    );
    this.logger.log(
      `[webhook:saved] provider=blockradar endpoint=blockradar inboundWebhookId=${record.id} status=pending`,
    );
    await this.enqueueOrFail(
      record.id,
      {
        provider: 'blockradar',
        endpoint: 'blockradar',
        payload: webhookData,
        inboundWebhookId: record.id,
        receivedAt: new Date().toISOString(),
      },
      record.providerWebhookId as string | undefined,
    );
    return { status: 'accepted', id: record.id };
  }

  @Post('ramp')
  @Public()
  @ApiOperation({ summary: 'Receive webhook from Flint API' })
  @ApiBody({ type: Object })
  @ApiResponse({ status: 200, description: 'Webhook accepted' })
  async handleRampWebhook(@Body() webhookData: any) {
    this.logger.log(
      `[webhook:received] provider=flint endpoint=ramp keys=${this.payloadKeys(webhookData)}`,
    );
    const record = await this.saveWebhook('flint', 'ramp', webhookData);
    this.logger.log(
      `[webhook:saved] provider=flint endpoint=ramp inboundWebhookId=${record.id} status=pending`,
    );
    await this.enqueueOrFail(
      record.id,
      {
        provider: 'flint',
        endpoint: 'ramp',
        payload: webhookData,
        inboundWebhookId: record.id,
        receivedAt: new Date().toISOString(),
      },
      record.providerWebhookId as string | undefined,
    );
    return { status: 'accepted', id: record.id };
  }

  @Post('pulse')
  @Public()
  @ApiOperation({ summary: 'Receive webhook from Pulse MFB API' })
  @ApiBody({ type: Object })
  @ApiResponse({ status: 200, description: 'Webhook accepted' })
  @ApiResponse({ status: 401, description: 'Invalid webhook signature' })
  async handlePulseMfbWebhook(
    @Body() webhookData: any,
    @Headers('x-webhook-signature') signature?: string,
  ) {
    this.logger.log(
      `[webhook:received] provider=pulse endpoint=pulse keys=${this.payloadKeys(webhookData)} hasSignature=${Boolean(signature)}`,
    );
    const record = await this.saveWebhook(
      'pulse',
      'pulse',
      webhookData,
      signature,
    );
    this.logger.log(
      `[webhook:saved] provider=pulse endpoint=pulse inboundWebhookId=${record.id} status=pending`,
    );
    await this.enqueueOrFail(
      record.id,
      {
        provider: 'pulse',
        endpoint: 'pulse',
        payload: webhookData,
        signature,
        inboundWebhookId: record.id,
        receivedAt: new Date().toISOString(),
      },
      record.providerWebhookId as string | undefined,
    );
    return { status: 'accepted', id: record.id };
  }

  private payloadKeys(payload: any): string {
    if (!payload || typeof payload !== 'object') return 'non-object';
    try {
      const keys = Object.keys(payload);
      const preview = keys.slice(0, 8).join(',');
      return `{${preview}}${keys.length > 8 ? `+${keys.length - 8}more` : ''}`;
    } catch {
      return 'unreadable';
    }
  }
}
