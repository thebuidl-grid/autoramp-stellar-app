import { extractPayout } from './payout-poll.service';
import { PayoutOrderRepository } from './payout-order.repository';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { MFBService } from '../safehaven/safehaven.service';
import { BitNobService } from '../bitnob/bitnob.service';
import { BitNobWebhookService } from '../bitnob/bitnob-webhook.service';
import { SafehavenOfframpSettlementService } from './safehaven-offramp-settlement.service';
import { SafehavenOnrampSettlementService } from './safehaven-onramp-settlement.service';
import { StellarOfframpRelayService } from './stellar-offramp-relay.service';

export type PaymentCheckKind = 'onramp' | 'offramp';

export interface PaymentCheckResult {
  reference: string;
  kind: PaymentCheckKind;
  status: string;
  /** True when this check moved the order forward (so the UI should refetch immediately). */
  progressed: boolean;
  message: string;
}

const TERMINAL = ['COMPLETED', 'FAILED', 'EXPIRED', 'REJECTED', 'CANCELLED', 'REVERSED', 'REFUNDED'];

/**
 * Manual "I've made the transfer" check. Webhooks are the normal signal; this asks the providers directly
 * and feeds whatever it finds through the same settlement code a webhook would use, so it is idempotent.
 */
@Injectable()
export class PaymentCheckService {
  private readonly logger = new Logger(PaymentCheckService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly safehaven: MFBService,
    private readonly bitnob: BitNobService,
    private readonly bitnobWebhooks: BitNobWebhookService,
    private readonly offrampSettlement: SafehavenOfframpSettlementService,
    private readonly onrampSettlement: SafehavenOnrampSettlementService,
    private readonly payoutOrders: PayoutOrderRepository,
    private readonly stellarRelay: StellarOfframpRelayService,
  ) {}

  async check(
    kind: PaymentCheckKind,
    reference: string,
    userId: string,
    isMerchant: boolean,
  ): Promise<PaymentCheckResult> {
    return kind === 'onramp'
      ? this.checkOnramp(reference, userId, isMerchant)
      : this.checkOfframp(reference, userId, isMerchant);
  }

  private async checkOnramp(reference: string, userId: string, isMerchant: boolean): Promise<PaymentCheckResult> {
    const tx: any = isMerchant
      ? await this.prisma.merchantOnrampTransaction.findFirst({ where: { reference, merchantId: userId } })
      : await this.prisma.onrampTransaction.findFirst({ where: { reference, userId } });
    if (!tx) throw new NotFoundException('Onramp order not found');

    const done = (message: string, progressed = false): PaymentCheckResult => ({
      reference, kind: 'onramp', status: tx.status, progressed, message,
    });
    if (tx.status !== 'PENDING') return done(`Order is ${tx.status}.`);

    const account = (tx.metadata as any)?.safehaven?.accountNumber;
    if (isMerchant || !account) {
      return done('We detect this payment automatically. Please allow a few minutes.');
    }

    const credit = await this.findSafehavenCredit(account);
    if (!credit) return done("We haven't received your payment yet. Please try again in a minute.");

    const result: any = await this.onrampSettlement.settleCredit(tx, { amount: credit.amount });
    const fresh = await this.prisma.onrampTransaction.findUnique({ where: { id: tx.id }, select: { status: true } });
    const status = fresh?.status ?? tx.status;
    const progressed = result?.status === 'success' || status !== tx.status;
    return {
      reference, kind: 'onramp', status, progressed,
      message: progressed ? 'Payment found. Sending your USDC now.' : 'Payment found and already being processed.',
    };
  }

  private async checkOfframp(reference: string, userId: string, isMerchant: boolean): Promise<PaymentCheckResult> {
    const order = await this.payoutOrders.findByReference(reference);
    const tx: any = isMerchant
      ? await this.prisma.merchantOfframpTransaction.findFirst({ where: { reference, merchantId: userId } })
      : await this.prisma.offrampTransaction.findFirst({ where: { reference, userId } });
    if (!tx) throw new NotFoundException('Offramp order not found');

    const result = (status: string, message: string, progressed = false): PaymentCheckResult => ({
      reference, kind: 'offramp', status, progressed, message,
    });
    if (TERMINAL.includes(tx.status)) return result(tx.status, `Order is ${tx.status}.`);

    let progressed = false;

    // 0. Stellar off-ramp over CCTP: make sure the Base mint has been relayed.
    if (!isMerchant && (tx.metadata as any)?.cctpRelay && (tx.metadata as any)?.stellarTxHash) {
      try {
        const relayed = await this.stellarRelay.relay(reference, userId);
        if (relayed.state === 'minted' && (tx.metadata as any).cctpRelay.status !== 'minted') progressed = true;
      } catch (error: any) {
        this.logger.warn(`[payment-check] relay for ${reference} failed: ${error?.message}`);
      }
    }

    // 1. Bitnob: has the USDC deposit been converted / the payout progressed?
    if (order?.providerOrderId) {
      try {
        const res = await this.bitnob.getPayoutByReference(reference);
        const payout = extractPayout(res);
        const payoutStatus = String(payout?.status ?? '').toLowerCase();
        if (payoutStatus) {
          const out: any = await this.bitnobWebhooks.processWebhook({
            event: `payouts.${payoutStatus}`,
            data: { ...payout, id: payout?.id ?? order.providerOrderId, reference: payout?.reference ?? reference },
          });
          if (out?.status && !['ignored', 'duplicate'].includes(out.status)) progressed = true;
        }
      } catch (error: any) {
        this.logger.warn(`[payment-check] Bitnob payout lookup failed for ${reference}: ${error?.message}`);
      }
    }

    // 2. SafeHaven: did the NGN land in the collection account (and is it waiting to be forwarded)?
    const collection = (tx.metadata as any)?.safehaven?.accountNumber;
    if (!isMerchant && collection) {
      const credit = await this.findSafehavenCredit(collection);
      if (credit) {
        const fresh: any = await this.prisma.offrampTransaction.findUnique({ where: { id: tx.id } });
        const out: any = await this.offrampSettlement.settleCredit(fresh ?? tx, { amount: credit.amount });
        if (out?.status === 'success' || out?.status === 'waiting') progressed = true;
      }
    }

    const fresh: any = isMerchant
      ? await this.prisma.merchantOfframpTransaction.findUnique({ where: { id: tx.id }, select: { status: true } })
      : await this.prisma.offrampTransaction.findUnique({ where: { id: tx.id }, select: { status: true } });
    const status = fresh?.status ?? tx.status;
    return result(
      status,
      progressed || status !== tx.status
        ? 'Update found. Your order is moving along.'
        : "We haven't detected your deposit yet. Please try again in a minute.",
      progressed || status !== tx.status,
    );
  }

  /** Admin reconciliation for a known off-ramp reference. Resolves the owner internally so the same
   * provider lookups and idempotent settlement handlers are used as the customer check endpoint. */
  async reconcileOfframp(reference: string): Promise<PaymentCheckResult> {
    const userOrder = await this.prisma.offrampTransaction.findFirst({
      where: { reference },
      select: { userId: true },
    });
    if (userOrder) return this.checkOfframp(reference, userOrder.userId, false);

    const merchantOrder = await this.prisma.merchantOfframpTransaction.findFirst({
      where: { reference },
      select: { merchantId: true },
    });
    if (merchantOrder) return this.checkOfframp(reference, merchantOrder.merchantId, true);

    throw new NotFoundException('Offramp order not found');
  }

  /**
   * Latest completed inbound credit to one of our SafeHaven virtual accounts. Matches strictly on the account
   * number so an unrelated transfer can never settle an order.
   */
  async findSafehavenCredit(accountNumber: string): Promise<{ amount: number; reference?: string } | null> {
    try {
      const res: any = await this.safehaven.getTransfers({ accountNumber, page: 0, limit: 20 });
      const body = res?.data ?? res;
      const list: any[] = Array.isArray(body) ? body : (body?.docs ?? body?.items ?? body?.data ?? []);
      for (const item of Array.isArray(list) ? list : []) {
        const credited = String(
          item?.creditAccountNumber ?? item?.destinationAccountNumber ?? item?.creditAccount?.accountNumber ?? '',
        );
        const status = String(item?.status ?? '').toLowerCase();
        const amount = Number(item?.amount);
        if (
          credited === accountNumber &&
          ['completed', 'successful', 'success'].includes(status) &&
          Number.isFinite(amount) &&
          amount > 0
        ) {
          return { amount, reference: item?.paymentReference ?? item?.reference };
        }
      }
    } catch (error: any) {
      this.logger.warn(`[payment-check] SafeHaven transfer lookup failed for ${accountNumber}: ${error?.message}`);
    }
    return null;
  }
}
