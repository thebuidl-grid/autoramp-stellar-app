import {
  Injectable,
  Logger,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { WebhookDto } from './dto/webhook.dto';
import { SwapGateway } from '../swap/swap.gateway';
import { NotificationsService } from '../merchants/notifications/notifications.service';

/**
 * Webhook Service
 *
 * Handles webhook events from Flint API to update transaction statuses.
 * Processes status updates for onramp and offramp transactions.
 */
@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => SwapGateway))
    private readonly swapGateway: SwapGateway,
    private readonly notificationsService: NotificationsService,
  ) {}

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

    // Determine transaction type from event name or reference prefix
    let transactionType = this.determineTransactionType(event, reference);

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
          if (!transaction) {
            transaction = await this.prisma.merchantOnrampTransaction.findFirst(
              {
                where: { paymentReference: transactionId },
              },
            );
            if (transaction) transaction._isMerchant = true;
          }
        } else if (transactionType === 'offramp') {
          transaction = await this.prisma.offrampTransaction.findFirst({
            where: { flintTransactionId: transactionId },
          });
          if (!transaction) {
            transaction =
              await this.prisma.merchantOfframpTransaction.findFirst({
                where: { paymentReference: transactionId },
              });
            if (transaction) transaction._isMerchant = true;
          }
        } else {
          transaction =
            (await this.prisma.onrampTransaction.findFirst({
              where: { flintTransactionId: transactionId },
            })) ||
            (await this.prisma.merchantOnrampTransaction.findFirst({
              where: { paymentReference: transactionId },
            }));

          if (transaction) {
            transactionType = transaction.merchantId ? 'onramp' : 'onramp'; // Fallback
            if (transaction.merchantId) transaction._isMerchant = true;
          }

          if (!transaction) {
            transaction =
              (await this.prisma.offrampTransaction.findFirst({
                where: { flintTransactionId: transactionId },
              })) ||
              (await this.prisma.merchantOfframpTransaction.findFirst({
                where: { paymentReference: transactionId },
              }));
            if (transaction) {
              transactionType = 'offramp';
              if (transaction.merchantId) transaction._isMerchant = true;
            }
          }
        }
      }

      if (!transaction && reference) {
        // OTC transactions are identified by their 'otc_' prefixed reference or UUID
        const uuidRegex =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        const isUuid = uuidRegex.test(reference);

        if (
          transactionType === 'otc' ||
          reference.startsWith('otc_') ||
          isUuid
        ) {
          // OTC transactions are identified by their 'otc_' prefixed reference
          transaction = await this.prisma.otcTransaction.findFirst({
            where: { reference: reference as any },
          });
          if (transaction) transactionType = 'otc';
        }

        if (!transaction) {
          if (transactionType === 'onramp') {
            transaction =
              (await this.prisma.onrampTransaction.findUnique({
                where: { reference },
              })) ||
              (await this.prisma.merchantOnrampTransaction.findUnique({
                where: { reference },
              }));
            if (transaction?.merchantId) transaction._isMerchant = true;
          } else if (transactionType === 'offramp') {
            transaction =
              (await this.prisma.offrampTransaction.findUnique({
                where: { reference },
              })) ||
              (await this.prisma.merchantOfframpTransaction.findUnique({
                where: { reference },
              }));
            if (transaction?.merchantId) transaction._isMerchant = true;
          } else {
            // If type is unknown, search all
            transaction =
              (await this.prisma.onrampTransaction.findUnique({
                where: { reference },
              })) ||
              (await this.prisma.merchantOnrampTransaction.findUnique({
                where: { reference },
              }));

            if (transaction) {
              transactionType = 'onramp';
              if (transaction.merchantId) transaction._isMerchant = true;
            }

            if (!transaction) {
              transaction =
                (await this.prisma.offrampTransaction.findUnique({
                  where: { reference },
                })) ||
                (await this.prisma.merchantOfframpTransaction.findUnique({
                  where: { reference },
                }));
              if (transaction) {
                transactionType = 'offramp';
                if (transaction.merchantId) transaction._isMerchant = true;
              }
            }
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

      // Map status from webhook to our status enum
      const mappedStatus = this.mapStatus(status || 'pending');

      // Get old status for logging
      const oldStatus = transaction.status;

      // Update transaction based on type
      let updatedTransaction: any;

      // For OTC transactions, handle separately:
      // We map COMPLETED -> PROCESSING (payment received, tokens not yet issued)
      if (transactionType === 'otc') {
        const otcInternalStatus = mappedStatus;
        const meta = transaction.meta || {};
        updatedTransaction = await this.prisma.otcTransaction.update({
          where: { id: transaction.id },
          data: {
            status: otcInternalStatus as any,
            updatedAt: new Date(),
            meta: {
              ...meta,
              flintData: webhookDataPayload,
              paymentReference: reference,
            },
          },
        });

        this.logger.log(
          `OTC transaction ${transaction.id} status updated: ${oldStatus} -> ${otcInternalStatus}`,
        );

        await this.prisma.webhookEvent.create({
          data: {
            transactionType: 'otc' as any,
            transactionId: transaction.id,
            reference: transaction.reference,
            eventType: event || 'status_update',
            status: otcInternalStatus,
            provider: 'flint',
            payload: webhookData as any,
            processed: true,
            processedAt: new Date(),
          },
        });

        await this.prisma.transactionLog.create({
          data: {
            transactionType: 'otc' as any,
            transactionId: transaction.id,
            userId: transaction.userId,
            action: 'status_changed',
            oldStatus: oldStatus,
            newStatus: otcInternalStatus,
            description: `OTC status updated via Flint webhook: ${event || 'status_update'}`,
            metadata: webhookData as any,
          },
        });

        return updatedTransaction;
      }

      // Prepare update data for onramp/offramp
      const updateData: any = {
        status: mappedStatus,
      };

      if (mappedStatus === 'COMPLETED') {
        updateData.completedAt = new Date();
      }

      // For onramp transactions, update additional fields
      if (transactionType === 'onramp') {
        if (webhookDataPayload.onrampHash) {
          // Store onramp hash in metadata if we have a metadata field
          // Or you could add a specific field for this in the schema
          updateData.metadata = {
            ...(transaction.metadata || {}),
            onrampHash: webhookDataPayload.onrampHash,
          };
        }
        if (webhookDataPayload.processedAmount) {
          updateData.tokenAmount = webhookDataPayload.processedAmount;
        }
        if (webhookDataPayload.depositAccount) {
          updateData.depositAccount = webhookDataPayload.depositAccount;
        }
      }

      // For offramp transactions
      if (transactionType === 'offramp') {
        if (webhookDataPayload.processedAmount) {
          updateData.fiatAmount = webhookDataPayload.processedAmount;
        }
      }

      // Update transaction based on type
      // Update transaction based on type
      if (transactionType === 'onramp') {
        if (transaction._isMerchant) {
          updatedTransaction =
            await this.prisma.merchantOnrampTransaction.update({
              where: { id: transaction.id },
              data: updateData,
            });
        } else {
          updatedTransaction = await this.prisma.onrampTransaction.update({
            where: { id: transaction.id },
            data: updateData,
          });
        }

        // Emit WebSocket event for onramp update
        if (this.swapGateway) {
          this.swapGateway.emitTransactionUpdate(updatedTransaction.reference, {
            type: 'onramp',
            status: mappedStatus,
            onrampId: updatedTransaction.id,
          });
        }

        // Update merchant onramp if it exists and NOT already updated
        if (!transaction._isMerchant) {
          try {
            const merchantOnramp =
              await this.prisma.merchantOnrampTransaction.findUnique({
                where: { reference: updatedTransaction.reference },
              });
            if (merchantOnramp) {
              const updatedMerchantOnramp =
                await this.prisma.merchantOnrampTransaction.update({
                  where: { id: merchantOnramp.id },
                  data: {
                    status: mappedStatus,
                    completedAt:
                      mappedStatus === 'COMPLETED' ? new Date() : undefined,
                    tokenAmount: updatedTransaction.tokenAmount,
                  },
                });
              await this.notificationsService.notifyMerchant(
                merchantOnramp.merchantId,
                'onramp.updated',
                updatedMerchantOnramp,
              );
            }
          } catch (error) {
            this.logger.error(
              `Error updating merchant onramp: ${error.message}`,
            );
          }
        } else {
          // If it IS a merchant transaction, notify the merchant
          try {
            await this.notificationsService.notifyMerchant(
              transaction.merchantId,
              'onramp.updated',
              updatedTransaction,
            );
          } catch (error) {
            this.logger.error(
              `Error notifying merchant onramp: ${error.message}`,
            );
          }
        }
      } else {
        if (transaction._isMerchant) {
          updatedTransaction =
            await this.prisma.merchantOfframpTransaction.update({
              where: { id: transaction.id },
              data: updateData,
            });
        } else {
          updatedTransaction = await this.prisma.offrampTransaction.update({
            where: { id: transaction.id },
            data: updateData,
          });
        }

        // If offramp is completed and has a linked swap, also complete the swap
        if (mappedStatus === 'COMPLETED' && updatedTransaction.swapId) {
          try {
            const swapTransaction =
              await this.prisma.swapTransaction.findUnique({
                where: { id: updatedTransaction.swapId },
              });

            if (swapTransaction && swapTransaction.status !== 'COMPLETED') {
              await this.prisma.swapTransaction.update({
                where: { id: swapTransaction.id },
                data: {
                  status: 'COMPLETED',
                  completedAt: new Date(),
                },
              });

              // Create transaction log for swap
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

              this.logger.log(
                `Swap transaction ${swapTransaction.id} completed (offramp completed)`,
              );

              // Emit WebSocket event for swap completion
              if (this.swapGateway) {
                this.swapGateway.emitTransactionUpdate(
                  swapTransaction.reference,
                  {
                    type: 'swap',
                    status: 'COMPLETED',
                    swapId: swapTransaction.id,
                  },
                );
              }

              // Update merchant swap if it exists
              try {
                const merchantSwap =
                  await this.prisma.merchantSwapTransaction.findUnique({
                    where: { reference: swapTransaction.reference },
                  });
                if (merchantSwap) {
                  const updatedMerchantSwap =
                    await this.prisma.merchantSwapTransaction.update({
                      where: { id: merchantSwap.id },
                      data: {
                        status: 'COMPLETED',
                        completedAt: new Date(),
                      },
                    });
                  await this.notificationsService.notifyMerchant(
                    merchantSwap.merchantId,
                    'swap.updated',
                    updatedMerchantSwap,
                  );
                }
              } catch (error) {
                this.logger.error(
                  `Error updating merchant swap: ${error.message}`,
                );
              }
            }
          } catch (error) {
            this.logger.error(
              `Error completing swap transaction for offramp ${updatedTransaction.id}: ${error.message}`,
            );
          }
        }

        // Emit WebSocket event for offramp update
        if (this.swapGateway) {
          this.swapGateway.emitTransactionUpdate(updatedTransaction.reference, {
            type: 'offramp',
            status: mappedStatus,
            offrampId: updatedTransaction.id,
          });
        }

        // Update merchant offramp if it exists
        try {
          const merchantOfframp =
            await this.prisma.merchantOfframpTransaction.findUnique({
              where: { reference: updatedTransaction.reference },
            });
          if (merchantOfframp) {
            const updatedMerchantOfframp =
              await this.prisma.merchantOfframpTransaction.update({
                where: { id: merchantOfframp.id },
                data: {
                  status: mappedStatus,
                  completedAt:
                    mappedStatus === 'COMPLETED' ? new Date() : undefined,
                  fiatAmount: updatedTransaction.fiatAmount,
                },
              });
            await this.notificationsService.notifyMerchant(
              merchantOfframp.merchantId,
              'offramp.updated',
              updatedMerchantOfframp,
            );
          }
        } catch (error) {
          this.logger.error(
            `Error updating merchant offramp: ${error.message}`,
          );
        }
      }

      // Save webhook event
      await this.prisma.webhookEvent.create({
        data: {
          transactionType,
          transactionId: transaction.id,
          reference: transaction.reference,
          eventType: event || 'status_update',
          status: mappedStatus,
          provider: 'flint',
          payload: webhookData as any,
          processed: true,
          processedAt: new Date(),
        },
      });

      // Create transaction log
      await this.prisma.transactionLog.create({
        data: {
          transactionType,
          transactionId: transaction.id,
          userId: transaction.userId,
          action: 'status_changed',
          oldStatus: oldStatus,
          newStatus: mappedStatus,
          description: `Status updated via webhook: ${event || 'status_update'}`,
          metadata: webhookData as any,
        },
      });

      this.logger.log(
        `Transaction ${transaction.id} status updated: ${oldStatus} -> ${mappedStatus}`,
      );

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
      const webhookDataPayload = webhookData.data;
      const eventName = webhookEvent?.event || 'error';
      const txId = webhookDataPayload?.transactionId;
      const txReference = webhookDataPayload?.reference;
      const txStatus = webhookDataPayload?.status || 'unknown';
      const determinedType = this.determineTransactionType(eventName);

      if (txId || txReference) {
        // Try to find transaction to get its ID
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
              // Search both if type is unknown
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
              // Search both if type is unknown
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
          // Ignore find errors
          this.logger.warn(
            `Failed to find transaction in error handler: ${findError.message}`,
          );
        }

        try {
          await this.prisma.webhookEvent.create({
            data: {
              transactionType: determinedType,
              transactionId: savedTransactionId,
              reference: txReference || 'unknown',
              eventType: eventName,
              status: txStatus,
              provider: 'flint',
              payload: webhookData as any,
              processed: false,
              errorMessage: error.message,
            },
          });
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
   * Determine transaction type from event name
   *
   * @param event - Event name from webhook (e.g., 'onramp.completed', 'offramp.failed')
   * @returns Transaction type ('onramp' or 'offramp')
   */
  private determineTransactionType(
    event: string,
    reference?: string,
  ): 'onramp' | 'offramp' | 'otc' {
    // OTC transactions have an 'otc_' prefixed reference
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (
      reference?.startsWith('otc_') ||
      (reference && uuidRegex.test(reference))
    ) {
      return 'otc';
    }

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

    // Default to onramp if cannot determine
    return 'onramp';
  }

  /**
   * Map webhook status to our transaction status enum
   *
   * @param status - Status from webhook
   * @returns Mapped status
   */
  private mapStatus(
    status: string,
  ): 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' {
    const statusMap: Record<
      string,
      'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
    > = {
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
