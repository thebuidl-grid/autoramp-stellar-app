import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { BlockRadarService } from './blockradar.service';
import { NotificationsService } from '../merchants/notifications/notifications.service';

export interface BlockRadarWebhookPayload {
  event: string;
  data: {
    id?: string;
    address?: string;
    amount?: string | number;
    asset?: string;
    blockchain?: string;
    txHash?: string;
    status?: string;
    timestamp?: string;
    [key: string]: any;
  };
}

@Injectable()
export class BlockRadarWebhookService {
  private readonly logger = new Logger(BlockRadarWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly blockRadarService: BlockRadarService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async processWebhook(payload: BlockRadarWebhookPayload) {
    this.logger.log(`[BlockRadar] Webhook received: event=${payload.event}`);

    try {
      switch (payload.event) {
        case 'deposit':
          return await this.handleDeposit(payload.data);
        case 'withdrawal':
          return await this.handleWithdrawal(payload.data);
        case 'virtual_account.deposit':
        case 'virtual_account.credited':
          return await this.handleVirtualAccountDeposit(payload.data);
        default:
          this.logger.warn(
            `[BlockRadar] Unhandled webhook event type: ${payload.event}`,
          );
          return { status: 'ignored', event: payload.event };
      }
    } catch (error) {
      this.logger.error(
        `[BlockRadar] Error processing webhook event="${payload.event}": ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Handle an inbound crypto deposit event from Block Radar.
   */
  private async handleDeposit(data: BlockRadarWebhookPayload['data']) {
    this.logger.log(
      `[BlockRadar] Crypto deposit received: txHash=${data.txHash}, address=${data.address}, amount=${data.amount} ${data.asset}`,
    );

    // Logic to handle standard crypto deposits (e.g., credit user wallet)
    return {
      status: 'processed',
      event: 'deposit',
      txHash: data.txHash,
    };
  }

  /**
   * Handle a crypto withdrawal event from Block Radar.
   */
  private async handleWithdrawal(data: BlockRadarWebhookPayload['data']) {
    this.logger.log(
      `[BlockRadar] Crypto withdrawal event: txHash=${data.txHash}, status=${data.status}, amount=${data.amount} ${data.asset}`,
    );

    // Logic to update transaction status in the database
    return {
      status: 'processed',
      event: 'withdrawal',
      txHash: data.txHash,
      withdrawalStatus: data.status,
    };
  }

  /**
   * Handle a virtual account (fiat) deposit.
   * Flow: Fiat In -> Confirm Deposit -> Automated Crypto Withdrawal Out.
   */
  private async handleVirtualAccountDeposit(
    data: BlockRadarWebhookPayload['data'],
  ) {
    this.logger.log(
      `[BlockRadar] Virtual account fiat deposit: id=${data.id}, amount=${data.amount} ${data.currency || 'NGN'}`,
    );

    // 1. Identify the user/destination from the virtual account data
    // The internal blockchain address is expected to be stored in metadata or linked via the virtual account ID
    const virtualAccountId = data.virtualAccountId || data.id;

    // TODO: Fetch the user's destination blockchain address from your DB
    // const settlementInfo = await this.prisma.virtualAccountSettlement.findUnique({
    //   where: { virtualAccountId }
    // });

    // For now, we'll check if it's in the webhook metadata or use a placeholder logic
    const destinationAddress = data.metadata?.destinationAddress;
    const blockchain = data.metadata?.blockchain || 'ethereum';
    const asset = data.metadata?.asset || 'USDT';

    if (!destinationAddress) {
      this.logger.warn(
        `[BlockRadar] Automated withdrawal failed: No destination address found for virtual account ${virtualAccountId}`,
      );
      return { status: 'pending_manual_withdrawal', virtualAccountId };
    }

    // 2. Calculate the crypto amount to withdraw (might need a rate conversion)
    // For this example, we assume the user wants to convert the fiat to crypto.
    // In a real flow, you might call getFiatExchangeRates() first.

    this.logger.log(
      `[BlockRadar] Initiating automated crypto withdrawal: ${data.amount} fiat -> ${destinationAddress} (${blockchain}/${asset})`,
    );

    try {
      // 3. Initiate the withdrawal from the master wallet
      // Note: You might need to perform a swap first if the master wallet doesn't have the asset
      const withdrawalResult =
        await this.blockRadarService.withdrawMasterWallet({
          blockchain,
          asset,
          amount: Number(data.amount), // This should be the calculated crypto amount
          to: destinationAddress,
        });

      return {
        status: 'automated_withdrawal_initiated',
        virtualAccountId,
        withdrawalId: withdrawalResult?.data?.id,
      };
    } catch (error) {
      this.logger.error(
        `[BlockRadar] Automated withdrawal trigger failed for virtual account ${virtualAccountId}: ${error.message}`,
      );
      // Fallback: Notify admin or mark for manual retry
      return { status: 'automated_withdrawal_failed', error: error.message };
    }
  }
}
