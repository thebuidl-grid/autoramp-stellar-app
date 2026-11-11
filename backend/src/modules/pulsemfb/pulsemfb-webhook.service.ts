import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import * as crypto from 'crypto';
import { NotificationsService } from '../merchants/notifications/notifications.service';
import { BalanceCacheService } from '../../common/services/balance-cache.service';

@Injectable()
export class PulseMfbWebhookService {
  private readonly logger = new Logger(PulseMfbWebhookService.name);
  private readonly webhookSecret: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly balanceCacheService: BalanceCacheService,
  ) {
    this.webhookSecret =
      this.configService.get<string>('pulseMfbWebhookSecret') || '';
  }

  /**
   * Process Pulse MFB webhook event
   */
  async processWebhook(payload: any, signature?: string) {
    this.logger.log(`Received Pulse MFB webhook: ${JSON.stringify(payload)}`);

    // Verify signature if secret is configured
    if (this.webhookSecret && signature) {
      const isValid = this.verifySignature(payload, signature);
      if (!isValid) {
        this.logger.warn('Invalid Pulse MFB webhook signature');
        throw new UnauthorizedException('Invalid webhook signature');
      }
    } else if (this.webhookSecret && !signature) {
      this.logger.warn('Pulse MFB webhook received without signature');
      throw new UnauthorizedException('Missing webhook signature');
    }

    const eventType = payload.event;
    const data = payload.data || {};
    const reference = data.reference;

    if (!eventType) {
      this.logger.warn('Webhook received without event type');
      return { status: 'ignored', message: 'Missing event type' };
    }

    try {
      // Handle different event types
      switch (eventType) {
        case 'account.created':
          return this.handleAccountCreated(payload);
        case 'transfer.completed':
        case 'transfer.failed':
          return this.handleTransferEvent(payload);
        case 'vas.completed':
        case 'vas.failed':
          return this.handleVasEvent(payload);
        default:
          this.logger.log(`Unhandled Pulse MFB event type: ${eventType}`);
          await this.saveWebhookEvent(payload, null, 'unhandled');
          return {
            status: 'ignored',
            message: `Unhandled event type: ${eventType}`,
          };
      }
    } catch (error) {
      this.logger.error(
        `Error processing Pulse MFB webhook: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Verify webhook signature using HMAC-SHA256
   */
  private verifySignature(payload: any, signature: string): boolean {
    const expectedSignature = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(JSON.stringify(payload))
      .digest('hex');

    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature),
      );
    } catch {
      return false;
    }
  }

  /**
   * Handle account.created event
   */
  private async handleAccountCreated(payload: any) {
    const { data } = payload;
    const { account_number, account_name, reference } = data;

    this.logger.log(
      `Pulse MFB account created: ${account_number} / ${account_name} (ref: ${reference})`,
    );

    // Try to find the merchant via sub-account or bank account records
    let merchantId: string | null = null;

    // Check if this account number belongs to a merchant sub-account
    const subAccount = await this.prisma.merchantSubAccount.findFirst({
      where: { accountNumber: account_number },
      select: { merchantId: true },
    });
    if (subAccount) {
      merchantId = subAccount.merchantId;
    }

    // Fallback: check bank account by account number
    if (!merchantId) {
      const bankAccount = await this.prisma.merchantBankAccount.findFirst({
        where: { accountNumber: account_number },
        select: { merchantId: true },
      });
      if (bankAccount) {
        merchantId = bankAccount.merchantId;
      }
    }

    // Notify the merchant if we found one
    if (merchantId) {
      try {
        await this.notificationsService.notifyMerchantForAccountCreation(
          merchantId,
          {
            accountNumber: account_number,
            accountName: account_name,
            provider: 'pulse_mfb',
            reference,
          },
        );
      } catch (error) {
        this.logger.error(
          `Failed to notify merchant for account creation: ${error.message}`,
        );
      }
    }

    await this.saveWebhookEvent(payload, null, 'account_created');

    return {
      status: 'success',
      message: 'Account creation logged',
      accountNumber: account_number,
    };
  }

  /**
   * Handle transfer.completed and transfer.failed events
   */
  private async handleTransferEvent(payload: any) {
    const { event, data } = payload;
    const {
      reference,
      status,
      amount,
      debit_account,
      credit_account,
      narration,
    } = data;

    if (!reference) {
      this.logger.warn('Transfer webhook received without reference');
      return { status: 'ignored', message: 'Missing reference' };
    }

    this.logger.log(
      `Processing Pulse MFB transfer event: ${event} for reference ${reference}`,
    );

    // Find the corresponding transaction
    let transaction: any = null;
    let transactionType: string | null = null;
    let isMerchant = false;

    // Search across all transaction types by reference
    transaction = await this.prisma.onrampTransaction.findUnique({
      where: { reference },
    });
    if (transaction) transactionType = 'onramp';

    if (!transaction) {
      transaction = await this.prisma.merchantOnrampTransaction.findUnique({
        where: { reference },
        include: { merchant: true },
      });
      if (transaction) {
        transactionType = 'onramp';
        isMerchant = true;
      }
    }

    if (!transaction) {
      transaction = await this.prisma.offrampTransaction.findUnique({
        where: { reference },
      });
      if (transaction) transactionType = 'offramp';
    }

    if (!transaction) {
      transaction = await this.prisma.merchantOfframpTransaction.findUnique({
        where: { reference },
        include: { merchant: true },
      });
      if (transaction) {
        transactionType = 'offramp';
        isMerchant = true;
      }
    }

    if (!transaction) {
      transaction = await this.prisma.bridgeTransaction.findUnique({
        where: { reference },
      });
      if (transaction) transactionType = 'bridge';
    }

    if (!transaction) {
      transaction = await this.prisma.otcTransaction.findUnique({
        where: { reference },
      });
      if (transaction) transactionType = 'otc';
    }

    if (!transaction) {
      this.logger.warn(
        `Transaction not found for Pulse MFB reference: ${reference}`,
      );
      await this.saveWebhookEvent(payload, null, 'transaction_not_found');
      return { status: 'error', message: 'Transaction not found' };
    }

    const oldStatus = transaction.status;
    const mappedStatus = this.mapStatus(status);

    // For transfers, map COMPLETED -> PROCESSING (we may have further steps)
    const internalStatus =
      mappedStatus === 'COMPLETED' ? 'PROCESSING' : mappedStatus;

    // Update transaction
    let updatedTransaction: any;

    if (transactionType === 'onramp') {
      const model = isMerchant
        ? this.prisma.merchantOnrampTransaction
        : this.prisma.onrampTransaction;
      updatedTransaction = await (model as any).update({
        where: { id: transaction.id },
        data: {
          status: internalStatus as any,
          updatedAt: new Date(),
          ...(mappedStatus === 'COMPLETED' ? { completedAt: new Date() } : {}),
        },
      });
    } else if (transactionType === 'offramp') {
      const model = isMerchant
        ? this.prisma.merchantOfframpTransaction
        : this.prisma.offrampTransaction;
      updatedTransaction = await (model as any).update({
        where: { id: transaction.id },
        data: {
          status: internalStatus as any,
          updatedAt: new Date(),
          ...(mappedStatus === 'COMPLETED' ? { completedAt: new Date() } : {}),
        },
      });
    } else if (transactionType === 'bridge') {
      updatedTransaction = await this.prisma.bridgeTransaction.update({
        where: { id: transaction.id },
        data: {
          status: internalStatus,
          updatedAt: new Date(),
        },
      });
    } else if (transactionType === 'otc') {
      const meta = transaction.meta || {};
      updatedTransaction = await this.prisma.otcTransaction.update({
        where: { id: transaction.id },
        data: {
          status: internalStatus as any,
          updatedAt: new Date(),
          meta: {
            ...meta,
            pulseMfbData: data,
          },
        },
      });
    }

    // Create transaction log
    await this.prisma.transactionLog.create({
      data: {
        transactionType: (transactionType as any) || 'onramp',
        transactionId: transaction.id,
        userId: transaction.userId || transaction.merchant?.userId || undefined,
        action: 'status_changed',
        oldStatus: oldStatus,
        newStatus: internalStatus,
        description: `Status updated via Pulse MFB webhook: ${event}`,
        metadata: payload,
      },
    });

    // Save webhook event
    await this.saveWebhookEvent(payload, transaction.id, internalStatus);

    // Notify merchant if applicable
    if (isMerchant && transaction.merchantId) {
      try {
        await this.notificationsService.notifyMerchant(
          transaction.merchantId,
          `${transactionType}.updated`,
          updatedTransaction,
        );
      } catch (error) {
        this.logger.error(
          `Failed to notify merchant for Pulse MFB webhook: ${error.message}`,
        );
      }
    }

    if (debit_account) {
      const merchantId = await this.findMerchantByAccountNumber(debit_account);
      if (merchantId) {
        await this.balanceCacheService.invalidate('merchant', merchantId);
        const subAccount = await this.prisma.merchantSubAccount.findFirst({
          where: { accountNumber: debit_account },
          select: { id: true },
        });
        if (subAccount) {
          await this.balanceCacheService.invalidate('sub', subAccount.id);
        }
      }
    }

    return { status: 'success', transactionId: transaction.id };
  }

  private async findMerchantByAccountNumber(
    accountNumber: string,
  ): Promise<string | null> {
    const [bankAccount, subAccount, settlement] = await Promise.all([
      this.prisma.merchantBankAccount.findFirst({
        where: { accountNumber },
        select: { merchantId: true },
      }),
      this.prisma.merchantSubAccount.findFirst({
        where: { accountNumber },
        select: { merchantId: true },
      }),
      this.prisma.merchantSettlementAccount.findFirst({
        where: { accountNumber },
        select: { merchantId: true },
      }),
    ]);

    return (
      bankAccount?.merchantId ||
      subAccount?.merchantId ||
      settlement?.merchantId ||
      null
    );
  }

  /**
   * Handle VAS events (airtime, data, etc.)
   */
  private async handleVasEvent(payload: any) {
    const { event, data } = payload;
    const { reference, status } = data;

    this.logger.log(
      `Processing Pulse MFB VAS event: ${event} for reference ${reference}`,
    );

    // Try to find the VAS transaction by reference or externalReference
    const externalReference = data.externalReference || reference;
    let transaction: any = null;

    if (externalReference) {
      transaction = await this.prisma.vasTransaction.findFirst({
        where: {
          OR: [{ reference: externalReference }, { safehavenId: data._id }],
        },
        include: { merchant: true },
      });
    }

    if (!transaction) {
      this.logger.warn(
        `No VAS transaction found for Pulse MFB reference: ${reference}`,
      );
      await this.saveWebhookEvent(payload, null, 'vas_transaction_not_found');
      return { status: 'ignored', message: 'VAS transaction not found' };
    }

    const oldStatus = transaction.status;
    const mappedStatus = this.mapStatus(status);

    if (oldStatus === 'COMPLETED' || oldStatus === 'FAILED') {
      return { status: 'ignored', message: 'Already processed' };
    }

    await this.prisma.vasTransaction.update({
      where: { id: transaction.id },
      data: {
        status: mappedStatus,
        webhookPayload: payload,
        providerResponse: data,
        ...(mappedStatus === 'COMPLETED' ? { completedAt: new Date() } : {}),
      },
    });

    await this.prisma.transactionLog.create({
      data: {
        transactionType: 'vas',
        transactionId: transaction.id,
        userId: transaction.merchant?.userId || undefined,
        action: 'status_changed',
        oldStatus,
        newStatus: mappedStatus,
        description: `VAS status updated via Pulse MFB webhook: ${event}`,
        metadata: payload,
      },
    });

    await this.saveWebhookEvent(payload, transaction.id, mappedStatus);

    if (transaction.merchantId) {
      await this.balanceCacheService.invalidate(
        'merchant',
        transaction.merchantId,
      );
    }

    return { status: 'success', transactionId: transaction.id };
  }

  /**
   * Save webhook event to database for audit trail
   */
  private async saveWebhookEvent(
    payload: any,
    transactionId: string | null,
    status: string,
  ) {
    const data = payload.data || {};
    const reference = data.reference || 'unknown';
    const eventType = payload.event || 'unknown';

    try {
      await this.prisma.webhookEvent.create({
        data: {
          transactionType: 'onramp',
          transactionId:
            transactionId || '00000000-0000-0000-0000-000000000000',
          reference,
          eventType,
          status,
          provider: 'pulse_mfb',
          payload: payload,
          processed: !!transactionId,
          processedAt: transactionId ? new Date() : null,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to save webhook event: ${error.message}`);
    }
  }

  /**
   * Map Pulse MFB status strings to our internal TransactionStatus enum
   */
  private mapStatus(
    pulseStatus: string,
  ): 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' {
    const status = pulseStatus?.toLowerCase();
    if (status === 'completed' || status === 'success') return 'COMPLETED';
    if (status === 'failed' || status === 'failure') return 'FAILED';
    if (status === 'pending') return 'PENDING';
    if (status === 'cancelled' || status === 'canceled') return 'CANCELLED';
    return 'PROCESSING';
  }
}
