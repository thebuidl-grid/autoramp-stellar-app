import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../../database/prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);
  private static readonly MAX_RETRIES = 3;
  private static readonly RETRY_DELAYS_MS = [5000, 30000, 120000]; // 5s, 30s, 2min
  private retryTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly httpService: HttpService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    // Catch here: an unhandled rejection from a timer callback kills the
    // whole process (e.g. a transient DB P1001 crashed the API).
    this.retryTimer = setInterval(() => {
      this.retryFailedWebhooks().catch((err) =>
        this.logger.error(
          `Webhook retry sweep failed: ${err?.message ?? err}`,
          err?.stack,
        ),
      );
    }, 30000);
  }

  onDestroy() {
    if (this.retryTimer) clearInterval(this.retryTimer);
  }

  /**
   * Sign a webhook payload using HMAC-SHA256.
   */
  private signPayload(payload: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  }

  /**
   * Generate a new webhook secret.
   */
  generateWebhookSecret(): string {
    return `whsec_${crypto.randomBytes(32).toString('hex')}`;
  }

  /**
   * Send a webhook to a single endpoint.
   */
  private async sendWebhook(
    webhookId: string,
    merchantId: string,
    url: string,
    secret: string,
    event: string,
    body: any,
  ) {
    const bodyString = JSON.stringify(body);
    const signature = this.signPayload(bodyString, secret);

    try {
      const response = await firstValueFrom(
        this.httpService.post(url, body, {
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': signature,
            'X-Webhook-Event': event,
          },
          timeout: 10000,
        }),
      );

      this.logger.log(
        `Webhook sent to ${url} [${event}]. Status: ${response.status}`,
      );

      await this.prisma.merchantWebhookLog.create({
        data: {
          merchantId,
          event,
          url,
          payload: body,
          statusCode: response.status,
          response: response.data,
          success: true,
          retryCount: 0,
          maxRetries: NotificationsService.MAX_RETRIES,
        },
      });

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to send webhook to ${url}: ${error.message}`);

      await this.prisma.merchantWebhookLog.create({
        data: {
          merchantId,
          event,
          url,
          payload: body,
          statusCode: error.response?.status ?? null,
          response: error.response?.data ?? null,
          success: false,
          errorMessage: error.message,
          retryCount: 0,
          maxRetries: NotificationsService.MAX_RETRIES,
          nextRetryAt: new Date(Date.now() + NotificationsService.RETRY_DELAYS_MS[0]),
        },
      });
    }
  }

  /**
   * Core method: Send a webhook notification to all active webhook endpoints for a merchant.
   */
  async notifyMerchant(merchantId: string, event: string, payload: any) {
    const webhooks = await this.prisma.merchantWebhook.findMany({
      where: { merchantId, active: true },
      select: { id: true, url: true, secret: true, label: true },
    });

    const safePayload = this.sanitizePayload(payload);

    const body = {
      event,
      data: safePayload,
      timestamp: new Date().toISOString(),
    };

    if (webhooks.length === 0) {
      this.logger.warn(
        `No active webhooks for merchant ${merchantId} [${event}]; recording delivery log`,
      );
      await this.prisma.merchantWebhookLog.create({
        data: {
          merchantId,
          event,
          url: null,
          payload: body,
          success: false,
          errorMessage: 'No active webhook endpoint configured',
          retryCount: 0,
          maxRetries: NotificationsService.MAX_RETRIES,
        },
      });
      return;
    }

    // Fan out to all active webhooks in parallel
    const results = await Promise.allSettled(
      webhooks.map((wh) =>
        this.sendWebhook(wh.id, merchantId, wh.url, wh.secret, event, body),
      ),
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    this.logger.log(
      `Webhook fan-out for merchant ${merchantId} [${event}]: ${succeeded} sent, ${failed} failed`,
    );
  }

  /**
   * Notify merchant for a specific transaction type.
   */
  async notifyMerchantForTransaction(
    transactionType: 'onramp' | 'offramp' | 'swap',
    transactionId: string,
    event: string,
  ) {
    let transaction: any = null;

    if (transactionType === 'onramp') {
      transaction = await this.prisma.merchantOnrampTransaction.findUnique({
        where: { id: transactionId },
      });
    } else if (transactionType === 'offramp') {
      transaction = await this.prisma.merchantOfframpTransaction.findUnique({
        where: { id: transactionId },
      });
    } else if (transactionType === 'swap') {
      transaction = await this.prisma.merchantSwapTransaction.findUnique({
        where: { id: transactionId },
      });
    }

    if (transaction?.merchantId) {
      await this.notifyMerchant(transaction.merchantId, event, transaction);
    }
  }

  /**
   * Notify merchant for account creation events (e.g. Pulse MFB account.created).
   */
  async notifyMerchantForAccountCreation(
    merchantId: string,
    accountData: {
      accountNumber: string;
      accountName: string;
      provider: string;
      reference?: string;
      bankCode?: string;
    },
  ) {
    await this.notifyMerchant(merchantId, 'account.created', accountData);
  }

  /**
   * Retry failed webhook deliveries.
   */
  private async retryFailedWebhooks() {
    const now = new Date();

    const failedLogs = await this.prisma.merchantWebhookLog.findMany({
      where: {
        success: false,
        url: { not: null },
        retryCount: { lt: NotificationsService.MAX_RETRIES },
        nextRetryAt: { lte: now },
      },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });

    if (failedLogs.length === 0) return;

    this.logger.log(`Retrying ${failedLogs.length} failed webhook deliveries`);

    // Batch-fetch all active webhook secrets upfront (avoid N+1)
    const uniqueKeys = [
      ...new Set(failedLogs.map((l) => `${l.merchantId}:${l.url}`)),
    ];
    const webhookConditions = uniqueKeys.map((key) => {
      const [merchantId, url] = key.split(':');
      return { merchantId, url, active: true };
    });
    const activeWebhooks = await this.prisma.merchantWebhook.findMany({
      where: { OR: webhookConditions },
      select: { merchantId: true, url: true, secret: true },
    });
    const secretMap = new Map(
      activeWebhooks.map((w) => [`${w.merchantId}:${w.url}`, w.secret]),
    );

    for (const log of failedLogs) {
      if (!log.url) continue;

      const secret = secretMap.get(`${log.merchantId}:${log.url}`);

      if (!secret) {
        this.logger.warn(
          `No active webhook found for ${log.url}, skipping retry`,
        );
        continue;
      }

      const body = log.payload as any;
      const bodyString = JSON.stringify(body);
      const signature = this.signPayload(bodyString, secret);

      try {
        this.logger.log(
          `Retry #${log.retryCount + 1} for ${log.url} [${log.event}]`,
        );

        const response = await firstValueFrom(
          this.httpService.post(log.url, body, {
            headers: {
              'Content-Type': 'application/json',
              'X-Webhook-Signature': signature,
              'X-Webhook-Event': log.event,
            },
            timeout: 10000,
          }),
        );

        this.logger.log(
          `Retry succeeded for ${log.url}. Status: ${response.status}`,
        );

        await this.prisma.merchantWebhookLog.update({
          where: { id: log.id },
          data: {
            success: true,
            statusCode: response.status,
            response: response.data,
            retryCount: log.retryCount + 1,
            nextRetryAt: null,
          },
        });
      } catch (error) {
        const nextRetry =
          log.retryCount + 1 < NotificationsService.MAX_RETRIES
            ? NotificationsService.RETRY_DELAYS_MS[log.retryCount + 1]
            : null;

        await this.prisma.merchantWebhookLog.update({
          where: { id: log.id },
          data: {
            statusCode: error.response?.status ?? null,
            response: error.response?.data ?? null,
            errorMessage: error.message,
            retryCount: log.retryCount + 1,
            nextRetryAt: nextRetry ? new Date(nextRetry) : null,
          },
        });

        this.logger.warn(
          `Retry #${log.retryCount + 1} failed for ${log.url}: ${error.message}`,
        );
      }
    }
  }

  async retryWebhookLog(logId: string) {
    const log = await this.prisma.merchantWebhookLog.findUnique({
      where: { id: logId },
    });

    if (!log) {
      throw new Error('Webhook log not found');
    }

    if (!log.url) {
      throw new Error('No endpoint URL recorded for this webhook log');
    }

    const webhook = await this.prisma.merchantWebhook.findFirst({
      where: { merchantId: log.merchantId, url: log.url, active: true },
      select: { secret: true },
    });

    if (!webhook) {
      throw new Error('No active webhook endpoint found for this URL');
    }

    const body = log.payload as any;
    const bodyString = JSON.stringify(body);
    const signature = this.signPayload(bodyString, webhook.secret);

    try {
      const response = await firstValueFrom(
        this.httpService.post(log.url, body, {
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': signature,
            'X-Webhook-Event': log.event,
          },
          timeout: 10000,
        }),
      );

      await this.prisma.merchantWebhookLog.update({
        where: { id: log.id },
        data: {
          success: true,
          statusCode: response.status,
          response: response.data,
          retryCount: { increment: 1 },
          nextRetryAt: null,
        },
      });

      return { success: true, statusCode: response.status };
    } catch (error) {
      const nextRetryCount = log.retryCount + 1;
      const nextRetry =
        nextRetryCount < NotificationsService.MAX_RETRIES
          ? new Date(
              NotificationsService.RETRY_DELAYS_MS[nextRetryCount] ??
                NotificationsService.RETRY_DELAYS_MS[
                  NotificationsService.RETRY_DELAYS_MS.length - 1
                ],
            )
          : null;

      await this.prisma.merchantWebhookLog.update({
        where: { id: log.id },
        data: {
          statusCode: error.response?.status ?? null,
          response: error.response?.data ?? null,
          errorMessage: error.message,
          retryCount: { increment: 1 },
          nextRetryAt: nextRetry,
        },
      });

      throw error;
    }
  }

  /**
   * Remove internal-only fields before sending data to merchant webhooks.
   */
  private sanitizePayload(payload: Record<string, any>): Record<string, any> {
    if (!payload || typeof payload !== 'object') return payload;

    const internalFields = new Set([
      'webhookPayload',
      'providerResponse',
      'safehavenResponse',
      'ipAddress',
      'userAgent',
      '_isMerchant',
      '_transactionType',
      '_type',
      'safehavenId',
    ]);

    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(payload)) {
      if (internalFields.has(key)) continue;
      sanitized[key] = this.toJsonSafe(value, internalFields);
    }
    return sanitized;
  }

  /**
   * Deep-convert a value to plain JSON-safe primitives.
   * Handles Prisma Decimal / Date / BigInt / arrays so the result can be
   * JSON.stringify'd AND stored in Prisma Json columns (which reject class
   * instances like Decimal's `constructor` function).
   */
  private toJsonSafe(value: any, internalFields?: Set<string>): any {
    if (value === null || value === undefined) return value;
    if (typeof value === 'bigint') return value.toString();
    if (typeof value !== 'object') return value;
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) {
      return value.map((v) => this.toJsonSafe(v, internalFields));
    }
    if (typeof value.toJSON === 'function') {
      try {
        return this.toJsonSafe(value.toJSON(), internalFields);
      } catch {
        return String(value);
      }
    }
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      if (internalFields?.has(k)) continue;
      out[k] = this.toJsonSafe(v, internalFields);
    }
    return out;
  }
}
