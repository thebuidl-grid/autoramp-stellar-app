import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { CorridorService } from '../corridor/corridor.service';
import { RampProcessorRegistry } from './ramp-processor.registry';
import { generateTrxReference } from '../../utils/reference.util';

/**
 * Thin fiat-rail executor for a Sell-any-chain payout: by the time this is
 * called, custody of the sold asset's USDC-equivalent value is already
 * proven (it's sitting in AutoRamp's own distribution account, redirected
 * there by a completed BridgeTransfer — see BridgeService.deliverOfframp),
 * so unlike the Stellar-collection offramp path this skips straight to
 * PROCESSING/payout with no memo-watch step. Mirrors
 * StablestackService.completeDepositIfMemoMatched's payout call exactly,
 * just triggered by a different source of proof.
 */
@Injectable()
export class OfframpDeliveryService {
  private readonly logger = new Logger(OfframpDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly corridorService: CorridorService,
    private readonly rampProcessorRegistry: RampProcessorRegistry,
    private readonly configService: ConfigService,
  ) {}

  async executePayout(params: {
    userId: string;
    fiatAmount: string;
    fiatCurrency: string;
    bankCode: string;
    accountNumber: string;
    bridgeReference: string;
  }): Promise<{ offrampReference: string; providerTransactionId: string | null }> {
    const currency = params.fiatCurrency.toUpperCase();
    const corridor = await this.corridorService.findByCurrency(currency);
    const rampProcessor = this.rampProcessorRegistry.get(corridor.rampProcessorProvider);
    const webhookUrl = this.configService.get<string>('WEBHOOK_URL');

    const resolved = await rampProcessor.resolveAccount(params.bankCode, params.accountNumber, { currency, countryCode: corridor.countryCode });
    const accountName = (resolved as any)?.data?.accountName || (resolved as any)?.data?.account_name || null;

    const reference = generateTrxReference();
    const transaction = await this.prisma.offrampTransaction.create({
      data: {
        userId: params.userId,
        reference,
        amount: params.fiatAmount,
        currency,
        tokenType: 'USDC',
        status: 'PROCESSING',
        bankCode: params.bankCode,
        accountNumber: params.accountNumber,
        accountName,
        network: 'bridge',
        notifyUrl: webhookUrl || null,
        metadata: { bridgeReference: params.bridgeReference },
      },
    });

    await this.prisma.transactionLog.create({
      data: {
        transactionType: 'offramp',
        transactionId: transaction.id,
        userId: params.userId,
        action: 'created',
        newStatus: 'PROCESSING',
        description: `Cross-chain sell — bridge transfer ${params.bridgeReference} completed, triggering fiat payout directly (custody already proven).`,
      },
    });

    try {
      const payout = await rampProcessor.executeOfframpPayout({
        reference: transaction.reference,
        amount: Number(params.fiatAmount),
        bankCode: params.bankCode,
        accountNumber: params.accountNumber,
        notifyUrl: webhookUrl,
        currency,
        countryCode: corridor.countryCode,
      });

      await this.prisma.offrampTransaction.update({
        where: { id: transaction.id },
        data: { flintTransactionId: payout.providerTransactionId },
      });

      return { offrampReference: transaction.reference, providerTransactionId: payout.providerTransactionId ?? null };
    } catch (error: any) {
      // The USDC backing this payout is already sitting in the
      // distribution account (proven by the completed bridge transfer), so
      // — same reasoning as completeDepositIfMemoMatched — this deliberately
      // does NOT get silently retried here; left in PROCESSING for manual
      // ops reconciliation rather than risking a double-payout.
      this.logger.error(`Offramp ${transaction.reference} (bridge ${params.bridgeReference}): fiat payout failed — needs manual reconciliation: ${error.message}`);
      throw error;
    }
  }
}
