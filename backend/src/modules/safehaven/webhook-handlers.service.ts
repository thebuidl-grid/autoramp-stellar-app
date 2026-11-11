import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { MFBWebhookDto } from './dto/webhook.dto';
import { MFBService } from './safehaven.service';
import { NotificationsService } from '../merchants/notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import { BalanceCacheService } from '../../common/services/balance-cache.service';

@Injectable()
export class WebhookHandlers {
  private readonly logger = new Logger(WebhookHandlers.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly safehavenService: MFBService,
    private readonly mailService: MailService,
    private readonly notificationsService: NotificationsService,
    private readonly balanceCacheService: BalanceCacheService,
  ) {}

  mapStatus(
    shStatus: string,
  ): 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' {
    const status = shStatus.toLowerCase();
    if (status === 'completed' || status === 'success') return 'COMPLETED';
    if (status === 'failed' || status === 'declined') return 'FAILED';
    if (status === 'pending') return 'PENDING';
    return 'PROCESSING';
  }

  /**
   * Handle account.credit — money IN to an account (main account or sub-account).
   * Covers OTC auto-settlement, merchant account credit, and regular user onramp.
   */
  async handleCredit(payload: MFBWebhookDto) {
    const { data } = payload;
    const creditAccountNumber =
      data.creditAccountNumber || data.destinationAccountNumber;
    const customerId = data.metadata?.customerId;
    const eventType = payload.eventType || payload.type || payload.event;
    const paymentReference = data.paymentReference || data.reference;

    this.logger.log(
      `Processing account.credit for account: ${creditAccountNumber}, ref: ${paymentReference}`,
    );

    // 1. OTC user sub-account inflow → auto-settle
    const otcUser = await this.prisma.otcUser.findFirst({
      where: {
        OR: [{ accountNumber: creditAccountNumber }, { userId: customerId }],
      },
    });

    if (otcUser) {
      const transaction = await this.prisma.otcTransaction.findFirst({
        where: { userId: otcUser.userId, status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
      });

      if (!transaction) {
        this.logger.warn(
          `No pending OTC transaction found for user ${otcUser.userId}`,
        );
        await this.markWebhookProcessed(
          paymentReference,
          'No pending OTC transaction',
        );
        return { status: 'ignored', message: 'No pending OTC transaction' };
      }

      try {
        const meta = (transaction.meta as any) || {};
        const issuanceBankCode = meta.issuance?.bankCode;
        const issuanceAccountNumber = meta.issuance?.accountNumber;

        if (issuanceBankCode && issuanceAccountNumber) {
          const otcAmount = Number(transaction.amount);
          if (isNaN(otcAmount) || otcAmount <= 0) {
            this.logger.error(
              `Invalid OTC transfer amount for ${transaction.reference}: ${transaction.amount}`,
            );
            return { status: 'error', message: 'Invalid amount' };
          }

          this.logger.log(
            `Waiting 2 seconds for settlement of ${transaction.reference}...`,
          );
          await new Promise((resolve) => setTimeout(resolve, 2000));

          const transferPayload = {
            beneficiaryBankCode: issuanceBankCode,
            beneficiaryAccountNumber: issuanceAccountNumber,
            amount: otcAmount,
            narration: `OTC Settlement: ${transaction.reference}`,
            paymentReference: transaction.reference as any,
            debitAccountNumber: otcUser.accountNumber!,
          };
          const transferResult = await this.safehavenService.transfer(
            transferPayload,
            { transactionId: transaction.id, type: 'OFFRAMP' },
          );

          await this.prisma.otcTransaction.update({
            where: { id: transaction.id },
            data: {
              status: 'PROCESSING' as any,
              meta: {
                ...meta,
                inflowPayload: payload as any,
                transferResult,
              },
            },
          });

          try {
            const user = await this.prisma.user.findUnique({
              where: { id: otcUser.userId },
              select: { email: true, contactName: true, businessName: true },
            });

            await this.mailService.sendOtcInflowNotification({
              userEmail: user?.email || 'unknown',
              userName:
                user?.contactName ||
                user?.businessName ||
                user?.email ||
                'OTC User',
              transactionId: transaction.id,
              reference: transaction.reference,
              amountReceived: Number(transaction.amount),
              token: transaction.token,
              quantity: Number(transaction.quantity),
              rate: Number(transaction.rate),
              network: transaction.network,
              walletAddress: transaction.address,
            });
          } catch (notifyErr: any) {
            this.logger.warn(
              `OTC inflow email notification failed: ${notifyErr.message}`,
            );
          }

          await this.prisma.transactionLog.create({
            data: {
              transactionType: 'otc',
              transactionId: transaction.id,
              userId: otcUser.userId,
              action: 'status_changed',
              oldStatus: 'PENDING',
              newStatus: 'PROCESSING',
              description: `Auto-settlement triggered via account.credit: ${eventType}`,
              metadata: payload as any,
            },
          });

          return { status: 'success', transactionId: transaction.id };
        }

        this.logger.error(
          'OTC_ISSUANCE configuration missing in metadata and environment',
        );
        return { status: 'error', message: 'System configuration error' };
      } catch (error: any) {
        this.logger.error(
          `Failed to move OTC funds for ${(transaction as any).reference}: ${error.message}`,
        );
        throw error;
      }
    }

    // 2. Merchant account (sub-account / bank / settlement) credit
    const merchantId = creditAccountNumber
      ? await this.findMerchantByAccountNumber(creditAccountNumber)
      : null;

    if (merchantId) {
      this.logger.log(
        `Merchant account credited: ${merchantId}, amount: ${data.amount}`,
      );
      try {
        await this.notificationsService.notifyMerchant(
          merchantId,
          'account.credit',
          {
            amount: Number(data.amount),
            paymentReference,
            creditAccountNumber,
            creditAccountName: data.creditAccountName,
            debitAccountNumber: data.debitAccountNumber,
            debitAccountName: data.debitAccountName,
            narration: data.narration,
            status: this.mapStatus(data.status),
            eventType: 'account.credit',
          },
        );
      } catch (e: any) {
        this.logger.warn(
          `Failed to notify merchant for account.credit: ${e.message}`,
        );
      }

      await this.balanceCacheService.invalidate('merchant', merchantId);
      if (creditAccountNumber) {
        const subAccount = await this.prisma.merchantSubAccount.findFirst({
          where: { accountNumber: creditAccountNumber },
          select: { id: true },
        });
        if (subAccount) {
          await this.balanceCacheService.invalidate('sub', subAccount.id);
        }
      }

      await this.markWebhookProcessed(
        paymentReference,
        'Merchant account credit notified',
      );
      return { status: 'success', merchantId };
    }

    // 3. Regular user onramp inflow
    const onrampTx = await this.prisma.onrampTransaction.findFirst({
      where: {
        OR: [
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

    if (onrampTx) {
      this.logger.log(
        `Regular user onramp inflow detected for transaction ${onrampTx.id}, ref: ${onrampTx.reference}, amount: ${data.amount}`,
      );

      const oldStatus = onrampTx.status;

      if (oldStatus === 'PENDING') {
        await this.prisma.onrampTransaction.update({
          where: { id: onrampTx.id },
          data: { status: 'PROCESSING', updatedAt: new Date() },
        });

        await this.prisma.transactionLog.create({
          data: {
            transactionType: 'onramp',
            transactionId: onrampTx.id,
            userId: onrampTx.userId,
            action: 'status_changed',
            oldStatus: 'PENDING',
            newStatus: 'PROCESSING',
            description: `Inflow received via account.credit webhook: ${eventType}`,
            metadata: payload as any,
          },
        });

        this.logger.log(
          `Onramp transaction ${onrampTx.id} updated: PENDING -> PROCESSING via account.credit`,
        );
      }

      await this.markWebhookProcessed(
        paymentReference,
        'Onramp inflow processed',
      );
      return {
        status: 'success',
        transactionId: onrampTx.id,
        type: 'onramp_inflow',
      };
    }

    await this.markWebhookProcessed(
      paymentReference,
      'No matching transaction found',
    );
    return { status: 'ignored', message: 'No account owner found' };
  }

  /**
   * Find merchantId by account number across all merchant account tables.
   * Runs all 3 lookups in parallel.
   */
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
   * Handle account.debit — money OUT of an account (main account or sub-account).
   * Covers bank-transfer payout results, onramp settlement, and merchant outflow.
   */
  async handleDebit(payload: MFBWebhookDto) {
    const { data } = payload;
    const paymentReference =
      data.paymentReference || data.reference || data.sessionId;
    const responseCode = data.responseCode;
    const shStatus = data.status;
    const debitAccountNumber = data.debitAccountNumber;

    this.logger.log(
      `Processing account.debit for ref: ${paymentReference}, status: ${shStatus}, code: ${responseCode}, debitAccount: ${debitAccountNumber}`,
    );

    const mappedStatus =
      responseCode === '00' ? 'COMPLETED' : this.mapStatus(shStatus);

    // 1. Match a pending merchant bank transfer (payout result)
    if (paymentReference) {
      const candidates = await this.prisma.merchantBankTransfer.findMany({
        where: {
          OR: [
            { reference: paymentReference },
            { safehavenReference: paymentReference },
            ...(data.sessionId ? [{ safehavenReference: data.sessionId }] : []),
            ...(data.paymentReference &&
            data.paymentReference !== paymentReference
              ? [{ safehavenReference: data.paymentReference }]
              : []),
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });

      // Prefer the candidate from the same debit account when the provider
      // echoes an ambiguous reference; never match on debit account alone.
      const transfer =
        (debitAccountNumber
          ? candidates.find((c) => c.debitAccountNumber === debitAccountNumber)
          : candidates[0]) ?? candidates[0];

      if (transfer) {
        if (transfer.status === 'COMPLETED' || transfer.status === 'FAILED') {
          return { status: 'ignored', message: 'Already processed' };
        }

        await this.prisma.merchantBankTransfer.update({
          where: { id: transfer.id },
          data: {
            status: mappedStatus as any,
            completedAt: mappedStatus === 'COMPLETED' ? new Date() : null,
            metadata: {
              ...((transfer.metadata as any) || {}),
              lastWebhookEvent: 'account.debit',
              lastWebhookData: data as any,
              completedVia: 'handleDebit',
            },
          },
        });

        this.logger.log(
          `Bank transfer ${transfer.id} updated: ${transfer.status} -> ${mappedStatus}`,
        );

        if (transfer.merchantId) {
          try {
            await this.notificationsService.notifyMerchant(
              transfer.merchantId,
              'bank_transfer.completed',
              { ...transfer, status: mappedStatus },
            );
          } catch (e) {
            this.logger.warn(`Failed to notify merchant: ${e.message}`);
          }
        }

        return { status: 'success', transferId: transfer.id };
      }

      // 2. No bank transfer matched — check onramp settlement
      const onrampTx = await this.prisma.onrampTransaction.findFirst({
        where: {
          OR: [
            { reference: paymentReference },
            {
              safehavenAccount: {
                path: ['accountNumber'],
                equals: debitAccountNumber,
              },
            },
          ],
          status: 'PROCESSING',
        },
      });

      if (onrampTx) {
        const newStatus = mappedStatus;
        await this.prisma.onrampTransaction.update({
          where: { id: onrampTx.id },
          data: {
            status: newStatus,
            ...(newStatus === 'COMPLETED' ? { completedAt: new Date() } : {}),
          },
        });

        await this.prisma.transactionLog.create({
          data: {
            transactionType: 'onramp',
            transactionId: onrampTx.id,
            userId: onrampTx.userId,
            action: 'status_changed',
            oldStatus: 'PROCESSING',
            newStatus,
            description: `Settlement confirmed via account.debit webhook: ${shStatus}`,
            metadata: payload as any,
          },
        });

        this.logger.log(
          `Onramp transaction ${onrampTx.id} updated via settlement confirmation: PROCESSING -> ${newStatus}`,
        );

        await this.markWebhookProcessed(
          paymentReference,
          'Onramp settlement confirmed',
        );
        return {
          status: 'success',
          transactionId: onrampTx.id,
          type: 'onramp_settlement',
        };
      }

      const merchantOnramp =
        await this.prisma.merchantOnrampTransaction.findFirst({
          where: {
            OR: [{ reference: paymentReference }, { paymentReference }],
            status: 'PROCESSING',
          },
          include: { merchant: true },
        });

      if (merchantOnramp) {
        const newStatus = mappedStatus;
        await this.prisma.merchantOnrampTransaction.update({
          where: { id: merchantOnramp.id },
          data: {
            status: newStatus,
            ...(newStatus === 'COMPLETED' ? { completedAt: new Date() } : {}),
          },
        });

        await this.prisma.transactionLog.create({
          data: {
            transactionType: 'onramp',
            transactionId: merchantOnramp.id,
            userId: merchantOnramp.merchant?.userId || undefined,
            action: 'status_changed',
            oldStatus: 'PROCESSING',
            newStatus,
            description: `Merchant settlement confirmed via account.debit webhook: ${shStatus}`,
            metadata: payload as any,
          },
        });

        this.logger.log(
          `Merchant onramp transaction ${merchantOnramp.id} updated via settlement confirmation: PROCESSING -> ${newStatus}`,
        );

        if (merchantOnramp.merchantId) {
          try {
            await this.notificationsService.notifyMerchant(
              merchantOnramp.merchantId,
              'onramp.settlement_confirmed',
              { ...merchantOnramp, status: newStatus },
            );
          } catch (e) {
            this.logger.warn(
              `Failed to notify merchant for settlement: ${e.message}`,
            );
          }
        }

        await this.markWebhookProcessed(
          paymentReference,
          'Merchant onramp settlement confirmed',
        );
        return {
          status: 'success',
          transactionId: merchantOnramp.id,
          type: 'merchant_onramp_settlement',
        };
      }
    }

    // 3. Merchant sub-account / bank account outflow
    const merchantId = debitAccountNumber
      ? await this.findMerchantByAccountNumber(debitAccountNumber)
      : null;

    if (!merchantId) {
      this.logger.warn(
        `No merchant found for debit account: ${debitAccountNumber}`,
      );
      return { status: 'ignored', message: 'Merchant not found' };
    }

    try {
      await this.notificationsService.notifyMerchant(
        merchantId,
        'account.debit',
        {
          amount: Number(data.amount),
          paymentReference,
          debitAccountNumber,
          debitAccountName: data.debitAccountName,
          creditAccountNumber: data.creditAccountNumber,
          creditAccountName: data.creditAccountName,
          narration: data.narration,
          type: data.type,
          status: this.mapStatus(data.status),
          isReversed: data.isReversed,
          reversalReference: (data as any).reversalReference,
          eventType: 'account.debit',
        },
      );
    } catch (e: any) {
      this.logger.warn(
        `Failed to notify merchant for account.debit: ${e.message}`,
      );
    }

    await this.balanceCacheService.invalidate('merchant', merchantId);
    if (debitAccountNumber) {
      const subAccount = await this.prisma.merchantSubAccount.findFirst({
        where: { accountNumber: debitAccountNumber },
        select: { id: true },
      });
      if (subAccount) {
        await this.balanceCacheService.invalidate('sub', subAccount.id);
      }
    }

    return { status: 'success', merchantId };
  }

  async handleVasEvent(payload: MFBWebhookDto) {
    const { data } = payload;
    const eventType = payload.eventType || payload.type || payload.event;
    const externalReference = data.externalReference || data.reference;
    const status = data.status;

    this.logger.log(
      `Processing VAS event: ${eventType} for ref: ${externalReference}, status: ${status}`,
    );

    if (!externalReference) {
      this.logger.warn('VAS webhook received without reference');
      return { status: 'ignored', message: 'Missing reference' };
    }

    const mappedStatus = this.mapStatus(status);

    const transaction = await this.prisma.vasTransaction.findFirst({
      where: {
        OR: [{ reference: externalReference }, { safehavenId: data._id }],
      },
      include: { merchant: true },
    });

    if (!transaction) {
      this.logger.warn(
        `No VAS transaction found for ref: ${externalReference}`,
      );
      await this.markWebhookProcessed(
        externalReference,
        'VAS transaction not found',
      );
      return { status: 'ignored', message: 'VAS transaction not found' };
    }

    const oldStatus = transaction.status;
    if (oldStatus === 'COMPLETED' || oldStatus === 'FAILED') {
      return { status: 'ignored', message: 'Already processed' };
    }

    await this.prisma.vasTransaction.update({
      where: { id: transaction.id },
      data: {
        status: mappedStatus,
        webhookPayload: payload as any,
        providerResponse: data as any,
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
        description: `VAS status updated via SafeHaven webhook: ${eventType}`,
        metadata: payload as any,
      },
    });

    if (transaction.merchantId) {
      try {
        await this.notificationsService.notifyMerchant(
          transaction.merchantId,
          'vas.updated',
          { ...transaction, status: mappedStatus },
        );
      } catch (error) {
        this.logger.error(
          `Failed to notify merchant for VAS webhook: ${error.message}`,
        );
      }
    }

    await this.prisma.webhookEvent.create({
      data: {
        transactionType: 'vas',
        transactionId: transaction.id,
        reference: externalReference,
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

  private async markWebhookProcessed(
    reference: string | undefined,
    errorMessage: string,
  ) {
    if (!reference) return;
    try {
      const event = await this.prisma.webhookEvent.findFirst({
        where: { reference, provider: 'safehaven', processed: false },
        orderBy: { createdAt: 'desc' },
      });
      if (event) {
        await this.prisma.webhookEvent.update({
          where: { id: event.id },
          data: { processed: true, processedAt: new Date(), errorMessage },
        });
      }
    } catch (err: any) {
      this.logger.error(`Failed to mark webhook processed: ${err.message}`);
    }
  }
}
