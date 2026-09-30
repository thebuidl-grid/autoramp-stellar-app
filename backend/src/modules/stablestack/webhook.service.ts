import {
  Injectable,
  Logger,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { WebhookDto } from './dto/webhook.dto';
import { SwapGateway } from '../swap/swap.gateway';
import { StellarService } from '../stellar/stellar.service';
import { getAssetForCorridor } from '../swap/config/constant';
import { RampProcessorRegistry } from './ramp-processor.registry';
import { CorridorService } from '../corridor/corridor.service';
import { OnrampDeliveryService } from './onramp-delivery.service';

type TxStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
type TxType = 'onramp' | 'offramp';

/**
 * Webhook Service
 *
 * Handles webhook events from ramp processors to update transaction
 * statuses. `processWebhook` is Flint-shaped (the original processor);
 * other processors with structurally different webhook payloads (e.g.
 * Paystack — see PaystackRampProcessor) get their own entry point that
 * normalizes into the same shared completion logic below, so the
 * mint-on-onramp-complete and cascade-complete-linked-swap behavior isn't
 * duplicated per processor.
 */
@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => SwapGateway))
    private readonly swapGateway: SwapGateway,
    private readonly stellarService: StellarService,
    private readonly rampProcessorRegistry: RampProcessorRegistry,
    private readonly configService: ConfigService,
    private readonly corridorService: CorridorService,
    private readonly onrampDeliveryService: OnrampDeliveryService,
  ) {}

  /**
   * Resolved lazily at call time, not constructed at app boot — see
   * StablestackService.getDefaultProcessor for why (a misconfigured
   * default provider must not crash the whole app's startup).
   */
  private getDefaultProcessor() {
    // Reads process.env directly, not via ConfigService: this value must be
    // reconfigurable at call time (see StablestackService.getDefaultProcessor's
    // doc comment for why it's lazy at all) — but @nestjs/config bakes a
    // *defined* Joi-validated value into its internal snapshot at
    // ConfigModule import time and never re-reads process.env for it
    // afterward, defeating that. process.env itself has no such caching.
    const provider = process.env.RAMP_PROCESSOR_PROVIDER || 'flint';
    return this.rampProcessorRegistry.get(provider);
  }

  /**
   * Process webhook event
   *
   * Receives webhook from Flint API and updates corresponding transaction.
   * Supports both onramp and offramp transactions.
   *
   * @param webhookData - Webhook payload from Flint API
   * @returns Updated transaction record
   */
  async processWebhook(webhookData: WebhookDto) {
    this.logger.log(`Received webhook: ${JSON.stringify(webhookData)}`);

    const { event, data: webhookDataPayload } = webhookData;

    if (!event || !webhookDataPayload) {
      throw new Error('Invalid webhook payload: missing event or data');
    }

    const transactionId = webhookDataPayload.transactionId;
    const reference = webhookDataPayload.reference;
    const status = webhookDataPayload.status;

    const transactionType = this.determineTransactionType(event);

    this.logger.log(
      `Processing webhook: ${event} for transaction ${transactionId || reference} (type: ${transactionType})`,
    );

    try {
      let transaction: any = null;

      if (transactionId) {
        if (transactionType === 'onramp') {
          transaction = await this.prisma.onrampTransaction.findFirst({
            where: { flintTransactionId: transactionId },
          });
        } else if (transactionType === 'offramp') {
          transaction = await this.prisma.offrampTransaction.findFirst({
            where: { flintTransactionId: transactionId },
          });
        } else {
          transaction = await this.prisma.onrampTransaction.findFirst({
            where: { flintTransactionId: transactionId },
          });
          if (!transaction) {
            transaction = await this.prisma.offrampTransaction.findFirst({
              where: { flintTransactionId: transactionId },
            });
          }
        }
      }

      if (!transaction && reference) {
        if (transactionType === 'onramp') {
          transaction = await this.prisma.onrampTransaction.findUnique({
            where: { reference },
          });
        } else if (transactionType === 'offramp') {
          transaction = await this.prisma.offrampTransaction.findUnique({
            where: { reference },
          });
        } else {
          transaction = await this.prisma.onrampTransaction.findUnique({
            where: { reference },
          });
          if (!transaction) {
            transaction = await this.prisma.offrampTransaction.findUnique({
              where: { reference },
            });
          }
        }
      }

      if (!transaction) {
        this.logger.warn(
          `Transaction not found for webhook: ${transactionId || reference}`,
        );
        throw new NotFoundException(
          `Transaction not found: ${transactionId || reference}`,
        );
      }

      // This endpoint only speaks for Flint. A transaction on a corridor
      // routed through another processor (SafeHaven, Paystack) gets its
      // status from that processor's own verified webhook — accepting a
      // Flint-shaped completion for it here would let anyone who can reach
      // this URL mark an unpaid onramp as paid.
      const corridor = await this.corridorService.findByStablecoinCode(transaction.tokenType || 'CNGN');
      if (corridor.rampProcessorProvider !== 'flint') {
        this.logger.warn(
          `Ignoring Flint webhook for ${transaction.reference}: its corridor uses '${corridor.rampProcessorProvider}', not flint`,
        );
        return { ignored: true, reason: 'transaction is not on a Flint corridor' };
      }

      const mappedStatus = this.mapStatus(status || 'pending');

      const updatedTransaction = await this.applyStatusUpdate({
        transactionType,
        transaction,
        mappedStatus,
        eventName: event || 'status_update',
        rawPayload: webhookData,
        extra: {
          onrampHash: webhookDataPayload.onrampHash,
          processedAmount: webhookDataPayload.processedAmount,
          depositAccount: webhookDataPayload.depositAccount,
        },
      });

      return updatedTransaction;
    } catch (error) {
      this.logger.error(
        `Error processing webhook: ${error.message}`,
        error.stack,
      );

      // Save webhook event even if processing failed
      // Note: transaction variable may not be available in catch block
      let savedTransactionId = 'unknown';
      const webhookEvent = webhookData;
      const webhookDataPayloadInner = webhookData.data;
      const eventName = webhookEvent?.event || 'error';
      const txId = webhookDataPayloadInner?.transactionId;
      const txReference = webhookDataPayloadInner?.reference;
      const txStatus = webhookDataPayloadInner?.status || 'unknown';
      const determinedType = this.determineTransactionType(eventName);

      if (txId || txReference) {
        try {
          if (txId) {
            let foundTx: any = null;
            if (determinedType === 'onramp') {
              foundTx = await this.prisma.onrampTransaction.findFirst({
                where: { flintTransactionId: txId },
                select: { id: true },
              });
            } else if (determinedType === 'offramp') {
              foundTx = await this.prisma.offrampTransaction.findFirst({
                where: { flintTransactionId: txId },
                select: { id: true },
              });
            } else {
              foundTx =
                (await this.prisma.onrampTransaction.findFirst({
                  where: { flintTransactionId: txId },
                  select: { id: true },
                })) ||
                (await this.prisma.offrampTransaction.findFirst({
                  where: { flintTransactionId: txId },
                  select: { id: true },
                }));
            }
            if (foundTx) savedTransactionId = foundTx.id;
          } else if (txReference) {
            let foundTx: any = null;
            if (determinedType === 'onramp') {
              foundTx = await this.prisma.onrampTransaction.findUnique({
                where: { reference: txReference },
                select: { id: true },
              });
            } else if (determinedType === 'offramp') {
              foundTx = await this.prisma.offrampTransaction.findUnique({
                where: { reference: txReference },
                select: { id: true },
              });
            } else {
              foundTx =
                (await this.prisma.onrampTransaction.findUnique({
                  where: { reference: txReference },
                  select: { id: true },
                })) ||
                (await this.prisma.offrampTransaction.findUnique({
                  where: { reference: txReference },
                  select: { id: true },
                }));
            }
            if (foundTx) savedTransactionId = foundTx.id;
          }
        } catch (findError) {
          this.logger.warn(
            `Failed to find transaction in error handler: ${findError.message}`,
          );
        }

        try {
          // transactionId is a required UUID column with no FK (polymorphic
          // relation) — skip the write if we never resolved a real
          // transaction, rather than inserting the 'unknown' placeholder as
          // an invalid UUID (which throws and is silently swallowed below,
          // meaning the failure never actually gets audit-logged).
          if (savedTransactionId !== 'unknown') {
            await this.prisma.webhookEvent.create({
              data: {
                transactionType: determinedType,
                transactionId: savedTransactionId,
                reference: txReference || 'unknown',
                eventType: eventName,
                status: txStatus,
                payload: webhookData as any,
                processed: false,
                errorMessage: error.message,
              },
            });
          }
        } catch (saveError) {
          this.logger.error(
            `Failed to save webhook event: ${saveError.message}`,
          );
        }
      }

      throw error;
    }
  }

  /**
   * Process a Paystack webhook event. Structurally different from Flint's:
   *  - Onramp deposits arrive as `charge.success` with `channel:
   *    'dedicated_nuban'` — there's no reference we control (the deposit
   *    account is persistent per customer, not per-transaction), so the
   *    matching PENDING onramp is found by deposit account number, picking
   *    the oldest if more than one is pending on the same account. This
   *    needs real-world validation once live — it's a reasonable
   *    heuristic, not a guarantee, for users with multiple concurrent
   *    PENDING onramps.
   *  - Offramp payouts arrive as `transfer.success` / `transfer.failed` /
   *    `transfer.reversed`, matched via the transfer_code we stored in
   *    `flintTransactionId` when the transfer was created (field name is
   *    legacy — see PaystackRampProcessor).
   *
   * @param payload - Raw Paystack webhook body (already signature-verified by the caller)
   */
  async processPaystackWebhook(payload: any): Promise<any> {
    const event: string = payload?.event;
    const data = payload?.data;
    if (!event || !data) {
      throw new Error('Invalid Paystack webhook payload: missing event or data');
    }

    this.logger.log(`Received Paystack webhook: ${event}`);

    if (event === 'charge.success' && data.channel === 'dedicated_nuban') {
      const accountNumber: string | undefined = data.receiver_account_number ?? data.metadata?.receiver_account_number;
      if (!accountNumber) {
        throw new Error('Paystack charge.success (dedicated_nuban) missing receiver account number');
      }

      const pending = await this.prisma.onrampTransaction.findMany({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
      });
      const transaction = pending.find(
        (tx) => (tx.depositAccount as any)?.accountNumber === accountNumber,
      );

      if (!transaction) {
        throw new NotFoundException(
          `No PENDING onramp found for Paystack DVA account ${accountNumber}`,
        );
      }

      return this.applyStatusUpdate({
        transactionType: 'onramp',
        transaction,
        mappedStatus: 'COMPLETED',
        eventName: event,
        rawPayload: payload,
        extra: { processedAmount: data.amount ? data.amount / 100 : undefined }, // kobo -> naira
      });
    }

    // KES onramp (M-Pesa STK push via Paystack's Charge API — see
    // PaystackRampProcessor.initiateMobileMoneyCharge). Unlike the DVA path
    // above, we chose `reference` ourselves on the charge request, so this
    // matches directly instead of scanning PENDING transactions by account
    // number.
    if (event === 'charge.success' && data.channel === 'mobile_money') {
      const reference: string | undefined = data.reference;
      if (!reference) {
        throw new Error('Paystack charge.success (mobile_money) missing reference');
      }

      const transaction = await this.prisma.onrampTransaction.findFirst({
        where: { reference, status: 'PENDING' },
      });
      if (!transaction) {
        throw new NotFoundException(`No PENDING onramp found for Paystack mobile_money charge ${reference}`);
      }

      return this.applyStatusUpdate({
        transactionType: 'onramp',
        transaction,
        mappedStatus: 'COMPLETED',
        eventName: event,
        rawPayload: payload,
        extra: { processedAmount: data.amount ? data.amount / 100 : undefined },
      });
    }

    if (event === 'transfer.success' || event === 'transfer.failed' || event === 'transfer.reversed') {
      const transferCode: string | undefined = data.transfer_code;
      if (!transferCode) {
        throw new Error(`Paystack ${event} missing transfer_code`);
      }

      const transaction = await this.prisma.offrampTransaction.findFirst({
        where: { flintTransactionId: transferCode },
      });
      if (!transaction) {
        throw new NotFoundException(`No offramp found for Paystack transfer ${transferCode}`);
      }

      const mappedStatus: TxStatus = event === 'transfer.success' ? 'COMPLETED' : 'FAILED';

      return this.applyStatusUpdate({
        transactionType: 'offramp',
        transaction,
        mappedStatus,
        eventName: event,
        rawPayload: payload,
        extra: { processedAmount: data.amount ? data.amount / 100 : undefined },
      });
    }

    this.logger.log(`Ignoring unhandled Paystack event: ${event}`);
    return { ignored: true, event };
  }

  /**
   * Process a SafeHaven webhook event. Unlike Flint/Paystack, this never
   * trusts the payload's own status/amount fields — SafeHaven's docs don't
   * document a signature scheme, so the payload is only used to pull an
   * identifier (sessionId / paymentReference), which is then re-verified
   * against SafeHaven's authenticated status API via
   * `RampProcessor.verifyStatus` (see SafeHavenRampProcessor's class doc
   * for the full reasoning). If the currently-active RampProcessor isn't
   * SafeHaven (verifyStatus undefined), the event is ignored rather than
   * acted on.
   *
   * @param payload - Raw SafeHaven webhook body (route-level shared-secret
   *   check happens in the controller, not here — that's a lightweight
   *   mitigation layered on top, not a substitute for this re-verification)
   */
  async processSafeHavenWebhook(payload: any): Promise<any> {
    const rampProcessor = this.getDefaultProcessor();
    if (!rampProcessor.verifyStatus) {
      this.logger.warn('Received a SafeHaven webhook but the active RampProcessor is not SafeHaven; ignoring');
      return { ignored: true };
    }

    const data = payload?.data ?? payload;
    const sessionId: string | undefined = data?.sessionId;
    const paymentReference: string | undefined = data?.paymentReference ?? data?.externalReference;

    if (!sessionId && !paymentReference) {
      this.logger.warn('SafeHaven webhook missing sessionId/paymentReference, ignoring');
      return { ignored: true, reason: 'missing identifiers' };
    }

    this.logger.log(`Received SafeHaven webhook, re-verifying status for session=${sessionId} paymentRef=${paymentReference}`);

    const result = await rampProcessor.verifyStatus({ sessionId, paymentReference });
    if (!result || !result.reference) {
      this.logger.warn(
        `SafeHaven webhook: could not resolve an authoritative reference for session=${sessionId} paymentRef=${paymentReference}`,
      );
      return { ignored: true };
    }

    if (result.kind === 'onramp') {
      const transaction = await this.prisma.onrampTransaction.findUnique({ where: { reference: result.reference } });
      if (!transaction) {
        throw new NotFoundException(`No onramp found for SafeHaven reference ${result.reference}`);
      }
      if (transaction.status !== 'PENDING') {
        return transaction;
      }
      const mappedStatus: TxStatus = result.completed ? 'COMPLETED' : result.failed ? 'FAILED' : 'PENDING';
      if (mappedStatus === 'PENDING') {
        return transaction;
      }
      return this.applyStatusUpdate({
        transactionType: 'onramp',
        transaction,
        mappedStatus,
        eventName: 'safehaven.virtualAccount.transfer',
        rawPayload: payload,
      });
    }

    const transaction = await this.prisma.offrampTransaction.findUnique({ where: { reference: result.reference } });
    if (!transaction) {
      throw new NotFoundException(`No offramp found for SafeHaven reference ${result.reference}`);
    }
    if (transaction.status === 'COMPLETED' || transaction.status === 'FAILED') {
      return transaction;
    }
    const mappedStatus: TxStatus = result.completed ? 'COMPLETED' : result.failed ? 'FAILED' : (transaction.status as TxStatus);
    if (mappedStatus === transaction.status) {
      return transaction;
    }
    return this.applyStatusUpdate({
      transactionType: 'offramp',
      transaction,
      mappedStatus,
      eventName: 'safehaven.transfer',
      rawPayload: payload,
    });
  }

  /**
   * Shared status-transition logic used by both processWebhook (Flint) and
   * processPaystackWebhook: applies the DB update (with the onramp-mint /
   * offramp-cascade side effects), then writes the audit trail
   * (webhookEvent + transactionLog) exactly once, regardless of which
   * processor triggered it.
   */
  private async applyStatusUpdate(params: {
    transactionType: TxType;
    transaction: any;
    mappedStatus: TxStatus;
    eventName: string;
    rawPayload: any;
    extra?: { onrampHash?: string; processedAmount?: number; depositAccount?: any };
  }): Promise<any> {
    const { transactionType, transaction, mappedStatus, eventName, rawPayload, extra } = params;

    const { updated, oldStatus } =
      transactionType === 'onramp'
        ? await this.completeOnrampTransaction(transaction, mappedStatus, extra)
        : await this.completeOfframpTransaction(transaction, mappedStatus, extra);

    await this.prisma.webhookEvent.create({
      data: {
        transactionType,
        transactionId: transaction.id,
        reference: transaction.reference,
        eventType: eventName,
        status: mappedStatus,
        payload: rawPayload,
        processed: true,
        processedAt: new Date(),
      },
    });

    await this.prisma.transactionLog.create({
      data: {
        transactionType,
        transactionId: transaction.id,
        userId: transaction.userId,
        action: 'status_changed',
        oldStatus,
        newStatus: mappedStatus,
        description: `Status updated via webhook: ${eventName}`,
        metadata: rawPayload,
      },
    });

    this.logger.log(`Transaction ${transaction.id} status updated: ${oldStatus} -> ${mappedStatus}`);

    return updated;
  }

  private async completeOnrampTransaction(
    transaction: any,
    mappedStatus: TxStatus,
    extra: { onrampHash?: string; processedAmount?: number; depositAccount?: any } = {},
  ): Promise<{ updated: any; oldStatus: string }> {
    const oldStatus = transaction.status;
    const updateData: any = { status: mappedStatus };
    if (mappedStatus === 'COMPLETED') {
      updateData.completedAt = new Date();
    }
    if (extra.onrampHash) {
      updateData.metadata = {
        ...((transaction.metadata as any) || {}),
        onrampHash: extra.onrampHash,
      };
    }
    if (extra.processedAmount) {
      updateData.tokenAmount = extra.processedAmount;
    }
    if (extra.depositAccount) {
      updateData.depositAccount = extra.depositAccount;
    }

    // Fiat payment confirmed via the ramp processor's webhook — deliver
    // this corridor's stablecoin (transaction.tokenType, e.g. CNGN or
    // CGHS) from AutoRamp's distribution account. Only on the transition
    // into COMPLETED, and only once (guarded by mintTransactionHash/
    // bridgeReference already being set).
    if (
      mappedStatus === 'COMPLETED' &&
      oldStatus !== 'COMPLETED' &&
      !(transaction.metadata as any)?.mintTransactionHash &&
      !(transaction.metadata as any)?.bridgeReference
    ) {
      // Never deliver more than the onramp was created for — a processor-
      // reported amount can only lower it (a short payment), not raise it.
      const orderedAmount = new Prisma.Decimal(transaction.amount.toString());
      const mintAmount = (
        extra.processedAmount
          ? Prisma.Decimal.min(new Prisma.Decimal(extra.processedAmount.toString()), orderedAmount)
          : orderedAmount
      ).toString();
      const corridor = await this.corridorService.findByStablecoinCode(transaction.tokenType || 'CNGN');

      const payoutChain = transaction.payoutChain || 'stellar';
      const payoutTokenCode = transaction.payoutTokenCode || null;
      const isDefaultDelivery = payoutChain === 'stellar' && (!payoutTokenCode || payoutTokenCode.toUpperCase() === corridor.stablecoinCode.toUpperCase());

      if (isDefaultDelivery) {
        // Today's only behavior, unchanged: straight to the user's Stellar
        // wallet, no swap/bridge hop.
        const mintHash = await this.stellarService.sendFromDistribution({
          asset: getAssetForCorridor(corridor),
          amount: mintAmount,
          destination: transaction.destinationAddress,
        });

        updateData.metadata = {
          ...(updateData.metadata || (transaction.metadata as any) || {}),
          mintTransactionHash: mintHash,
        };

        this.logger.log(`Minted ${corridor.stablecoinCode} for onramp ${transaction.reference}: ${mintHash}`);
      } else {
        const result = await this.onrampDeliveryService.deliverOnramp({
          userId: transaction.userId,
          corridor,
          mintAmount,
          payoutChain,
          payoutTokenCode,
          destinationAddress: transaction.destinationAddress,
        });

        updateData.metadata = {
          ...(updateData.metadata || (transaction.metadata as any) || {}),
          ...(result.mintTxHash && { mintTransactionHash: result.mintTxHash }),
          ...(result.bridgeReference && { bridgeReference: result.bridgeReference }),
        };

        this.logger.log(`Delivered onramp ${transaction.reference} to ${payoutChain}${payoutTokenCode ? '/' + payoutTokenCode : ''}: ${result.mintTxHash || result.bridgeReference}`);
      }
    }

    const updated = await this.prisma.onrampTransaction.update({
      where: { id: transaction.id },
      data: updateData,
    });

    if (this.swapGateway) {
      this.swapGateway.emitTransactionUpdate(updated.reference, {
        type: 'onramp',
        status: mappedStatus,
        onrampId: updated.id,
      });
    }

    return { updated, oldStatus };
  }

  private async completeOfframpTransaction(
    transaction: any,
    mappedStatus: TxStatus,
    extra: { processedAmount?: number } = {},
  ): Promise<{ updated: any; oldStatus: string }> {
    const oldStatus = transaction.status;
    const updateData: any = { status: mappedStatus };
    if (mappedStatus === 'COMPLETED') {
      updateData.completedAt = new Date();
    }
    if (extra.processedAmount) {
      updateData.fiatAmount = extra.processedAmount;
    }

    const updated = await this.prisma.offrampTransaction.update({
      where: { id: transaction.id },
      data: updateData,
    });

    if (mappedStatus === 'COMPLETED' && updated.swapId) {
      try {
        const swapTransaction = await this.prisma.swapTransaction.findUnique({
          where: { id: updated.swapId },
        });

        if (swapTransaction && swapTransaction.status !== 'COMPLETED') {
          await this.prisma.swapTransaction.update({
            where: { id: swapTransaction.id },
            data: { status: 'COMPLETED', completedAt: new Date() },
          });

          await this.prisma.transactionLog.create({
            data: {
              transactionType: 'swap',
              transactionId: swapTransaction.id,
              userId: swapTransaction.userId,
              action: 'status_changed',
              oldStatus: swapTransaction.status,
              newStatus: 'COMPLETED',
              description: 'Swap transaction completed (offramp completed)',
            },
          });

          this.logger.log(`Swap transaction ${swapTransaction.id} completed (offramp completed)`);

          if (this.swapGateway) {
            this.swapGateway.emitTransactionUpdate(swapTransaction.reference, {
              type: 'swap',
              status: 'COMPLETED',
              swapId: swapTransaction.id,
            });
          }
        }
      } catch (error: any) {
        this.logger.error(
          `Error completing swap transaction for offramp ${updated.id}: ${error.message}`,
        );
      }
    }

    if (this.swapGateway) {
      this.swapGateway.emitTransactionUpdate(updated.reference, {
        type: 'offramp',
        status: mappedStatus,
        offrampId: updated.id,
      });
    }

    return { updated, oldStatus };
  }

  /**
   * Determine transaction type from event name
   *
   * @param event - Event name from webhook (e.g., 'onramp.completed', 'offramp.failed')
   * @returns Transaction type ('onramp' or 'offramp')
   */
  private determineTransactionType(event: string): TxType {
    if (!event) {
      return 'onramp'; // Default to onramp if unknown
    }

    const eventLower = event.toLowerCase();
    if (eventLower.includes('offramp')) {
      return 'offramp';
    }
    if (eventLower.includes('onramp')) {
      return 'onramp';
    }

    return 'onramp';
  }

  /**
   * Map webhook status to our transaction status enum
   *
   * @param status - Status from webhook
   * @returns Mapped status
   */
  private mapStatus(status: string): TxStatus {
    const statusMap: Record<string, TxStatus> = {
      pending: 'PENDING',
      processing: 'PROCESSING',
      completed: 'COMPLETED',
      success: 'COMPLETED',
      failed: 'FAILED',
      failure: 'FAILED',
      cancelled: 'CANCELLED',
      canceled: 'CANCELLED',
    };

    return statusMap[status?.toLowerCase()] || 'PENDING';
  }
}
