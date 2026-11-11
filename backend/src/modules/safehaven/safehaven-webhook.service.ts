import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { MFBWebhookDto } from './dto/webhook.dto';
import { MFBService } from './safehaven.service';
import { NotificationsService } from '../merchants/notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import { WebhookHandlers } from './webhook-handlers.service';
import { BalanceCacheService } from '../../common/services/balance-cache.service';

/**
 * Main MFB webhook processor.
 * Routes events to specific handlers in WebhookHandlers.
 */
@Injectable()
export class MFBWebhookService {
  private readonly logger = new Logger(MFBWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly safehavenService: MFBService,
    private readonly mailService: MailService,
    private readonly notificationsService: NotificationsService,
    private readonly handlers: WebhookHandlers,
    private readonly balanceCacheService: BalanceCacheService,
  ) {}

  async processWebhook(payload: MFBWebhookDto) {
    this.logger.log(`Received MFB webhook: ${JSON.stringify(payload)}`);

    const eventType = payload.eventType || payload.type || payload.event;
    const { data } = payload;
    const { status } = data;

    const paymentReference = data.paymentReference || data.reference;
    const externalReference = data.externalReference;

    // Persist every incoming webhook for audit/debugging
    try {
      await this.prisma.webhookEvent.create({
        data: {
          transactionType: 'onramp',
          transactionId: '00000000-0000-0000-0000-000000000000',
          reference: paymentReference || externalReference || 'unknown',
          eventType: eventType as any,
          status,
          provider: 'safehaven',
          payload: payload as any,
          processed: false,
        },
      });
    } catch (err: any) {
      this.logger.error(`Failed to persist incoming webhook: ${err.message}`);
    }

    // Account events — delegated to handlers
    if (eventType === 'account.credit') {
      return this.handlers.handleCredit(payload);
    }

    if (eventType === 'account.debit') {
      return this.handlers.handleDebit(payload);
    }

    // VAS events
    if (eventType?.startsWith('vas.')) {
      return this.handlers.handleVasEvent(payload);
    }

    // Transaction status updates (virtualAccount.transfer, etc.)
    if (!paymentReference) {
      this.logger.warn('Webhook received without paymentReference');
      return { status: 'ignored', message: 'Missing paymentReference' };
    }

    try {
      return await this.processTransactionUpdate(
        payload,
        paymentReference,
        externalReference ?? '',
        eventType ?? '',
      );
    } catch (error) {
      this.logger.error(
        `Error processing MFB webhook: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  private async processTransactionUpdate(
    payload: MFBWebhookDto,
    paymentReference: string,
    externalReference: string | undefined,
    eventType: string,
  ) {
    const { data } = payload;
    const { status } = data;

    let transaction: any = null;
    let transactionType: 'onramp' | 'offramp' | 'bridge' | 'otc' = 'onramp';

    const creditAccountNumber = data?.creditAccountNumber;
    const safehavenId = (data as any)?.virtualAccount;

    // Virtual Account Transfers (NIBSS)
    if (
      eventType === 'virtualAccount.transfer' &&
      (creditAccountNumber || safehavenId)
    ) {
      transaction = await this.findTransactionByVirtualAccount(
        creditAccountNumber,
        safehavenId,
        paymentReference,
      );
      if (transaction) {
        transactionType = transaction._transactionType || 'onramp';
      }

      // If no onramp/offramp match, check stand-alone merchant virtual accounts
      if (!transaction) {
        const va = await this.prisma.virtualAccount.findFirst({
          where: {
            OR: [
              { accountNumber: creditAccountNumber || '' },
              ...(safehavenId
                ? [
                    {
                      safehavenResponse: { path: ['_id'], equals: safehavenId },
                    },
                  ]
                : []),
              ...(externalReference ? [{ reference: externalReference }] : []),
            ].filter(Boolean),
          },
        });
        if (va && va.merchantId) {
          this.logger.log(
            `Virtual account funded: ${va.id}, amount: ${data.amount}`,
          );
          try {
            await this.notificationsService.notifyMerchant(
              va.merchantId,
              'virtual_account.funded',
              {
                virtualAccountId: va.id,
                accountNumber: va.accountNumber,
                reference: va.reference,
                externalReference: va.externalReference,
                amount: data.amount,
                paymentReference,
                status: this.handlers.mapStatus(status),
              },
            );
          } catch (e) {
            this.logger.warn(
              `Failed to notify merchant for virtual account funding: ${e.message}`,
            );
          }
          return { status: 'success', virtualAccountId: va.id };
        }
      }
    }

    // Fallback: lookup by exact reference
    if (!transaction) {
      transaction = await this.findTransactionByReference(
        paymentReference,
        externalReference,
      );
      if (transaction) {
        transactionType = transaction._transactionType || 'onramp';
      }
    }

    if (!transaction) {
      this.logger.warn(
        `Transaction not found for reference: ${paymentReference}`,
      );
      await this.prisma.webhookEvent.create({
        data: {
          transactionType: 'onramp',
          transactionId: '00000000-0000-0000-0000-000000000000',
          reference: paymentReference,
          eventType: eventType as any,
          status,
          provider: 'safehaven',
          payload: payload as any,
          processed: false,
          errorMessage: 'Transaction not found',
        },
      });
      return { status: 'error', message: 'Transaction not found' };
    }

    const oldStatus = transaction.status;
    const mappedStatus = this.handlers.mapStatus(status);

    // Guard: don't overwrite a terminal status (COMPLETED) with a lesser status
    if (oldStatus === 'COMPLETED' && mappedStatus !== 'COMPLETED') {
      this.logger.warn(
        `Ignoring ${mappedStatus} webhook for ${paymentReference}: transaction already COMPLETED`,
      );
      await this.prisma.webhookEvent.create({
        data: {
          transactionType: transactionType as any,
          transactionId: transaction.id,
          reference: paymentReference,
          eventType: eventType as any,
          status: mappedStatus,
          provider: 'safehaven',
          payload: payload as any,
          processed: true,
          processedAt: new Date(),
          errorMessage: `Ignored: transaction already COMPLETED`,
        },
      });
      return { status: 'ignored', message: 'Transaction already COMPLETED' };
    }

    let internalStatus:
      | 'PENDING'
      | 'PROCESSING'
      | 'COMPLETED'
      | 'FAILED'
      | 'CANCELLED' =
      mappedStatus === 'COMPLETED' ? 'PROCESSING' : mappedStatus;

    // Auto-settle onramp
    let settleErrorMessage: string | null = null;
    if (
      transactionType === 'onramp' &&
      mappedStatus === 'COMPLETED' &&
      oldStatus !== 'COMPLETED' &&
      oldStatus !== 'PROCESSING'
    ) {
      settleErrorMessage = await this.autoSettleOnramp(
        transaction,
        paymentReference,
      );
      if (settleErrorMessage) {
        this.logger.warn(
          `Settlement failed for ${paymentReference}: ${settleErrorMessage}. Keeping status as PROCESSING.`,
        );
        internalStatus = 'PROCESSING';
      } else {
        internalStatus = 'COMPLETED';
      }
    }

    // Update DB
    const updatedTransaction = await this.updateTransactionStatus(
      transaction,
      transactionType,
      internalStatus,
      data,
      paymentReference,
    );

    // Audit log
    await this.prisma.transactionLog.create({
      data: {
        transactionType: transactionType as any,
        transactionId: transaction.id,
        userId: transaction.userId || transaction.merchant?.userId || undefined,
        action: 'status_changed',
        oldStatus,
        newStatus: internalStatus,
        description: settleErrorMessage
          ? `Status updated via MFB webhook: ${eventType}. Settlement failed: ${settleErrorMessage}`
          : `Status updated via MFB webhook: ${eventType}`,
        metadata: {
          ...payload,
          settleError: settleErrorMessage,
        } as any,
      },
    });

    // Notify merchant
    const isMerchantTransaction =
      transaction._isMerchant || transaction.merchantId;
    if (isMerchantTransaction && transaction.merchantId) {
      try {
        await this.notificationsService.notifyMerchant(
          transaction.merchantId,
          `${transactionType}.updated`,
          updatedTransaction,
        );
      } catch (error) {
        this.logger.error(
          `Failed to notify merchant for SafeHaven webhook: ${error.message}`,
        );
      }
    }

    // Save processed event
    await this.prisma.webhookEvent.create({
      data: {
        transactionType: transactionType as any,
        transactionId: transaction.id,
        reference: paymentReference,
        eventType: eventType as any,
        status,
        provider: 'safehaven',
        payload: payload as any,
        processed: true,
        processedAt: new Date(),
      },
    });

    return { status: 'success', transactionId: transaction.id };
  }

  private async findTransactionByVirtualAccount(
    creditAccountNumber: string | undefined,
    safehavenId: string | undefined,
    paymentReference: string,
  ) {
    // User onramp
    const tx = await this.prisma.onrampTransaction.findFirst({
      where: {
        OR: [
          { safehavenAccount: { path: ['_id'], equals: safehavenId } },
          {
            depositAccount: {
              path: ['accountNumber'],
              equals: creditAccountNumber,
            },
          },
          {
            safehavenAccount: {
              path: ['accountNumber'],
              equals: creditAccountNumber,
            },
          },
        ],
        status: { not: 'COMPLETED' },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (tx) {
      (tx as any)._transactionType = 'onramp';
      return tx;
    }

    // Merchant onramp
    const merchantOnramp =
      await this.prisma.merchantOnrampTransaction.findFirst({
        where: {
          OR: [
            {
              depositAccount: {
                path: ['accountNumber'],
                equals: creditAccountNumber,
              },
            },
            ...(safehavenId
              ? [
                  {
                    depositAccount: {
                      path: ['_id'],
                      equals: safehavenId,
                    },
                  },
                ]
              : []),
          ],
          status: { not: 'COMPLETED' },
        },
        include: { merchant: { include: { bankAccount: true } } },
        orderBy: { createdAt: 'desc' },
      });
    if (merchantOnramp) {
      (merchantOnramp as any)._isMerchant = true;
      (merchantOnramp as any)._transactionType = 'onramp';
      if (!merchantOnramp.paymentReference) {
        await this.prisma.merchantOnrampTransaction
          .update({
            where: { id: merchantOnramp.id },
            data: { paymentReference },
          })
          .catch(() => {});
      }
      return merchantOnramp;
    }

    // User offramp
    const offramp = await this.prisma.offrampTransaction.findFirst({
      where: {
        OR: [
          { safehavenAccount: { path: ['_id'], equals: safehavenId } },
          {
            safehavenAccount: {
              path: ['accountNumber'],
              equals: creditAccountNumber,
            },
          },
        ],
        status: { not: 'COMPLETED' },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (offramp) {
      (offramp as any)._transactionType = 'offramp';
      return offramp;
    }

    // Merchant offramp
    const merchantOfframp =
      await this.prisma.merchantOfframpTransaction.findFirst({
        where: {
          OR: [
            { accountNumber: creditAccountNumber },
            { bankCode: creditAccountNumber },
          ],
          status: { not: 'COMPLETED' },
        },
        include: { merchant: { include: { bankAccount: true } } },
        orderBy: { createdAt: 'desc' },
      });
    if (merchantOfframp) {
      (merchantOfframp as any)._isMerchant = true;
      (merchantOfframp as any)._transactionType = 'offramp';
      return merchantOfframp;
    }

    return null;
  }

  private async findTransactionByReference(
    paymentReference: string,
    externalReference: string | undefined,
  ) {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const otcRef =
      externalReference &&
      (externalReference.startsWith('otc_') ||
        uuidRegex.test(externalReference))
        ? externalReference
        : paymentReference &&
            (paymentReference.startsWith('otc_') ||
              uuidRegex.test(paymentReference))
          ? paymentReference
          : externalReference || paymentReference;

    const results = await Promise.allSettled([
      this.prisma.onrampTransaction.findUnique({
        where: { reference: paymentReference },
      }),
      this.prisma.offrampTransaction.findUnique({
        where: { reference: paymentReference },
      }),
      this.prisma.merchantOnrampTransaction.findUnique({
        where: { reference: paymentReference },
        include: { merchant: { include: { bankAccount: true } } },
      }),
      this.prisma.merchantOfframpTransaction.findUnique({
        where: { reference: paymentReference },
        include: { merchant: { include: { bankAccount: true } } },
      }),
      this.prisma.bridgeTransaction.findUnique({
        where: { reference: paymentReference },
      }),
      this.prisma.otcTransaction.findUnique({ where: { reference: otcRef } }),
    ]);

    const meta: Array<[number, string, boolean]> = [
      [0, 'onramp', false],
      [1, 'offramp', false],
      [2, 'onramp', true],
      [3, 'offramp', true],
      [4, 'bridge', false],
      [5, 'otc', false],
    ];

    for (const [idx, type, isMerchant] of meta) {
      const r = results[idx];
      if (r.status === 'fulfilled' && r.value) {
        const tx = r.value as any;
        tx._transactionType = type;
        if (isMerchant) tx._isMerchant = true;
        return tx;
      }
    }

    return null;
  }

  private async autoSettleOnramp(
    transaction: any,
    paymentReference: string,
  ): Promise<string | null> {
    this.logger.log(
      `Onramp confirmed for ${paymentReference}. Moving funds to Stablestack...`,
    );

    const depositAccount = transaction.depositAccount;
    if (!depositAccount?.accountNumber || !depositAccount?.bankCode) {
      this.logger.error(
        `Missing deposit account details for ${paymentReference}. accountNumber: ${depositAccount?.accountNumber}, bankCode: ${depositAccount?.bankCode}`,
      );
      return 'Settlement account details missing';
    }

    const rawAmount = transaction.amount ?? transaction.fiatAmount;
    if (rawAmount == null) {
      this.logger.error(
        `No amount found for transaction ${paymentReference}. Cannot auto-settle.`,
      );
      return 'Transaction amount not found';
    }

    const transferAmount = Number(rawAmount);
    if (isNaN(transferAmount) || transferAmount <= 0) {
      this.logger.error(
        `Invalid transfer amount for ${paymentReference}: ${rawAmount}`,
      );
      return 'Invalid amount';
    }

    try {
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const transferPayload = {
        beneficiaryBankCode: depositAccount.bankCode,
        beneficiaryAccountNumber: depositAccount.accountNumber,
        amount: transferAmount,
        narration: `Funding: ${paymentReference}`,
        paymentReference,
      };
      await this.safehavenService.transfer(transferPayload, {
        transactionId: transaction.id,
        type: 'ONRAMP',
      });
      this.logger.log(
        `Stablestack transfer initiated successfully for ${paymentReference}`,
      );
      return null;
    } catch (e: any) {
      this.logger.error(
        `Failed to trigger Stablestack transfer for ${paymentReference}: ${e.message}`,
      );
      return `Settlement transfer failed: ${e.message}`;
    }
  }

  private async updateTransactionStatus(
    transaction: any,
    transactionType: string,
    internalStatus: string,
    data: any,
    paymentReference: string,
  ) {
    const transactionLocation = data?.transactionLocation;
    const webhookPayload = data;
    const fees = data?.fees ?? 0;
    const vat = data?.vat ?? 0;
    const stampDuty = data?.stampDuty ?? 0;

    if (transactionType === 'onramp') {
      const model = transaction._isMerchant
        ? this.prisma.merchantOnrampTransaction
        : this.prisma.onrampTransaction;
      const updated = await (model as any).update({
        where: { id: transaction.id },
        data: {
          status: internalStatus,
          updatedAt: new Date(),
          transactionLocation,
          webhookPayload,
        },
      });
      const feeEntries: any[] = [];
      if (fees > 0)
        feeEntries.push({
          transactionId: transaction.id,
          transactionType: 'onramp',
          feeAmount: fees,
          feeType: 'provider_fee',
          feeCurrency: 'NGN',
        });
      if (vat > 0)
        feeEntries.push({
          transactionId: transaction.id,
          transactionType: 'onramp',
          feeAmount: vat,
          feeType: 'vat',
          feeCurrency: 'NGN',
        });
      if (stampDuty > 0)
        feeEntries.push({
          transactionId: transaction.id,
          transactionType: 'onramp',
          feeAmount: stampDuty,
          feeType: 'stamp_duty',
          feeCurrency: 'NGN',
        });
      if (feeEntries.length) {
        await this.prisma.transactionFee.createMany({ data: feeEntries });
      }
      return updated;
    }

    if (transactionType === 'offramp') {
      const model = transaction._isMerchant
        ? this.prisma.merchantOfframpTransaction
        : this.prisma.offrampTransaction;
      return (model as any).update({
        where: { id: transaction.id },
        data: { status: internalStatus, updatedAt: new Date() },
      });
    }

    if (transactionType === 'bridge') {
      return this.prisma.bridgeTransaction.update({
        where: { id: transaction.id },
        data: { status: internalStatus, updatedAt: new Date() },
      });
    }

    if (transactionType === 'otc') {
      const meta = transaction.meta || {};
      return this.prisma.otcTransaction.update({
        where: { id: transaction.id },
        data: {
          status: internalStatus as any,
          updatedAt: new Date(),
          meta: { ...meta, safehavenData: data, paymentReference },
        },
      });
    }
  }
}
