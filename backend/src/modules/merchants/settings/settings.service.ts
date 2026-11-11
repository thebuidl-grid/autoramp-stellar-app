import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Get all webhooks for a merchant.
   */
  async getWebhooks(merchantId: string) {
    const webhooks = await this.prisma.merchantWebhook.findMany({
      where: { merchantId },
      select: {
        id: true,
        url: true,
        secret: true,
        active: true,
        label: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return webhooks;
  }

  /**
   * Add a new webhook endpoint for a merchant.
   */
  async addWebhook(merchantId: string, dto: { url: string; label?: string }) {
    // Check for duplicate URL
    const existing = await this.prisma.merchantWebhook.findFirst({
      where: { merchantId, url: dto.url },
    });

    if (existing) {
      throw new ConflictException('A webhook with this URL already exists');
    }

    const webhook = await this.prisma.merchantWebhook.create({
      data: {
        merchantId,
        url: dto.url,
        secret: this.notificationsService.generateWebhookSecret(),
        label: dto.label || null,
      },
      select: {
        id: true,
        url: true,
        secret: true,
        active: true,
        label: true,
        createdAt: true,
      },
    });

    return webhook;
  }

  /**
   * Update a webhook's URL or label.
   */
  async updateWebhook(
    merchantId: string,
    webhookId: string,
    dto: { url?: string; label?: string; active?: boolean },
  ) {
    const webhook = await this.prisma.merchantWebhook.findFirst({
      where: { id: webhookId, merchantId },
    });

    if (!webhook) {
      throw new NotFoundException('Webhook not found');
    }

    // If changing URL, check for duplicates
    if (dto.url && dto.url !== webhook.url) {
      const duplicate = await this.prisma.merchantWebhook.findFirst({
        where: { merchantId, url: dto.url, id: { not: webhookId } },
      });
      if (duplicate) {
        throw new ConflictException('A webhook with this URL already exists');
      }
    }

    const updated = await this.prisma.merchantWebhook.update({
      where: { id: webhookId },
      data: {
        ...(dto.url !== undefined && { url: dto.url }),
        ...(dto.label !== undefined && { label: dto.label }),
        ...(dto.active !== undefined && { active: dto.active }),
      },
      select: {
        id: true,
        url: true,
        secret: true,
        active: true,
        label: true,
        createdAt: true,
      },
    });

    return updated;
  }

  /**
   * Delete a webhook endpoint.
   */
  async deleteWebhook(merchantId: string, webhookId: string) {
    const webhook = await this.prisma.merchantWebhook.findFirst({
      where: { id: webhookId, merchantId },
    });

    if (!webhook) {
      throw new NotFoundException('Webhook not found');
    }

    await this.prisma.merchantWebhook.delete({
      where: { id: webhookId },
    });

    return { deleted: true };
  }

  /**
   * Rotate the signing secret for a specific webhook.
   */
  async rotateWebhookSecret(merchantId: string, webhookId: string) {
    const webhook = await this.prisma.merchantWebhook.findFirst({
      where: { id: webhookId, merchantId },
    });

    if (!webhook) {
      throw new NotFoundException('Webhook not found');
    }

    const newSecret = this.notificationsService.generateWebhookSecret();

    await this.prisma.merchantWebhook.update({
      where: { id: webhookId },
      data: { secret: newSecret },
    });

    return { webhookId, secret: newSecret };
  }

  /**
   * Get the first active webhook URL (used as callback for providers).
   */
  async getCallbackUrl(merchantId: string): Promise<string | null> {
    const webhook = await this.prisma.merchantWebhook.findFirst({
      where: { merchantId, active: true },
      select: { url: true },
      orderBy: { createdAt: 'asc' },
    });

    return webhook?.url || null;
  }

  async getSettlementAccount(merchantId: string) {
    const settlementAccount =
      await this.prisma.merchantSettlementAccount.findUnique({
        where: { merchantId },
      });

    return settlementAccount;
  }

  async updateSettlementAccount(id: string, data: any) {
    return this.prisma.merchantSettlementAccount.update({
      where: { id },
      data,
    });
  }
}
