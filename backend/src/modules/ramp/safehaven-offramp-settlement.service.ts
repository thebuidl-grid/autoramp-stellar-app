import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { MFBService } from '../safehaven/safehaven.service';
import { OfframpStateService } from './offramp-state.service';
import { isSafehavenNgnSettlementEnabled } from './safehaven-settlement.flag';

export interface SafehavenCollectionAccount {
  accountNumber: string;
  accountName: string;
  bankCode: string;
  bankName?: string;
}

const SUCCESS_STATUSES = ['completed', 'successful', 'success'];

/**
 * NGN settlement of user off-ramps through SafeHaven (on by default; SAFEHAVEN_NGN_SETTLEMENT=false disables).
 *
 *   USDC ─▶ Bitnob payout ─▶ NGN into a per-order SafeHaven virtual account
 *        ─▶ SafeHaven credit webhook ─▶ SafeHaven transfer ─▶ user's bank ─▶ COMPLETED
 *
 * Bitnob's own "payout completed" only means the NGN reached our virtual account, so the order stays
 * PAYOUT_PENDING until the onward transfer to the user is confirmed.
 */
@Injectable()
export class SafehavenOfframpSettlementService {
  private readonly logger = new Logger(SafehavenOfframpSettlementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly safehaven: MFBService,
    private readonly offrampState: OfframpStateService,
  ) {}

  /** NGN user off-ramps only; merchants and other countries keep paying out directly via Bitnob. */
  isEnabledFor(countryCode: string, isMerchant: boolean): boolean {
    return isSafehavenNgnSettlementEnabled(this.config, countryCode, isMerchant);
  }

  /** Per-order virtual account that Bitnob pays the NGN into. */
  async createCollectionAccount(reference: string, amount: number): Promise<SafehavenCollectionAccount> {
    const res = await this.safehaven.createVirtualAccount({
      validFor: 24 * 60 * 60,
      callbackUrl: this.config.get<string>('SH_WEBHOOK_URL') || '',
      amount,
      // Bitnob's settled amount can differ slightly from the quote; the credited amount is reconciled on credit.
      amountControl: 'OverPayment',
      externalReference: reference,
    });
    const acct = res?.data || res;
    if (!acct?.accountNumber) {
      throw new Error('SafeHaven did not return a virtual account number');
    }
    return {
      accountNumber: String(acct.accountNumber),
      accountName: String(acct.accountName ?? ''),
      bankCode: String(acct.bankCode || this.config.get<string>('SAFEHAVEN_BANK_CODE') || ''),
      bankName: acct.bankName ?? undefined,
    };
  }

  /** The user's off-ramp whose SafeHaven collection account is `accountNumber`, if any. */
  async findByCollectionAccount(accountNumber?: string | null) {
    if (!accountNumber) return null;
    return this.prisma.offrampTransaction.findFirst({
      where: { metadata: { path: ['safehaven', 'accountNumber'], equals: accountNumber } },
    });
  }

  /** The user's off-ramp whose onward transfer used `paymentReference`, if any. */
  async findByForwardReference(paymentReference?: string | null) {
    if (!paymentReference) return null;
    return this.prisma.offrampTransaction.findFirst({
      where: { metadata: { path: ['safehaven', 'forwardReference'], equals: paymentReference } },
    });
  }

  /** NGN arrived in the collection account: forward it to the user's bank (at most once per order). */
  async settleCredit(tx: any, credit: { amount?: number | string }) {
    const credited = Number(credit.amount);
    const expected = Number(tx.amount);
    if (!Number.isFinite(credited) || credited <= 0) {
      return { status: 'ignored', reason: 'invalid_credit_amount' };
    }
    if (['COMPLETED', 'REVERSED', 'FAILED', 'EXPIRED', 'REJECTED'].includes(tx.status)) {
      return { status: 'ignored', reason: `order_${tx.status}` };
    }

    // Claim: a unique event row makes concurrent / redelivered credit webhooks forward only once.
    const claimKey = `safehaven-forward:${tx.reference}`;
    try {
      await this.prisma.offrampEvent.create({
        data: { offrampTransactionId: tx.id, eventKey: claimKey, type: 'safehaven.forward' },
      });
    } catch {
      return { status: 'ignored', reason: 'already_forwarding' };
    }

    const forwardReference = `${tx.reference}-FWD`;
    const forwardAmount = Math.min(credited, expected > 0 ? expected : credited);
    await this.offrampState.apply(tx.id, 'PAYOUT_PENDING', {
      actor: 'safehaven-credit',
      reason: 'NGN received in SafeHaven collection account',
    });
    await this.patchMeta(tx.id, { credited, forwardReference, forwardError: null, needsReview: false });

    try {
      const body = await this.safehaven.transfer(
        {
          beneficiaryBankCode: tx.bankCode,
          beneficiaryAccountNumber: tx.accountNumber,
          amount: forwardAmount,
          narration: `AutoRamp payout ${tx.reference}`,
          paymentReference: forwardReference,
        },
        { transactionId: tx.id, type: 'OFFRAMP' },
      );
      const shStatus = String(body?.data?.status ?? '').toLowerCase();
      if (SUCCESS_STATUSES.includes(shStatus)) {
        await this.complete(tx, forwardAmount, credited < expected);
      }
      // Otherwise the account.debit webhook confirms the transfer (see settleDebit).
      return { status: 'success', reference: tx.reference, forwarded: forwardAmount };
    } catch (error: any) {
      this.logger.error(`[safehaven-settlement] forward failed for ${tx.reference}: ${error?.message}`);
      await this.releaseForRetry(tx, claimKey, error?.message ?? 'transfer failed');
      throw error;
    }
  }

  /** account.debit for the onward transfer: complete the order, or flag it for retry/review. */
  async settleDebit(tx: any, outcome: 'COMPLETED' | 'FAILED' | 'PROCESSING', data: any) {
    if (['COMPLETED', 'REVERSED'].includes(tx.status)) {
      return { status: 'ignored', reason: 'already_completed' };
    }
    if (outcome === 'COMPLETED') {
      const meta = ((tx.metadata as any)?.safehaven ?? {}) as { credited?: number };
      const amount = Number(data?.amount ?? meta.credited ?? tx.amount);
      await this.complete(tx, amount, Number(meta.credited ?? amount) < Number(tx.amount));
      return { status: 'success', reference: tx.reference };
    }
    if (outcome === 'FAILED') {
      await this.releaseForRetry(tx, `safehaven-forward:${tx.reference}`, data?.message || 'transfer failed');
      return { status: 'flagged', reference: tx.reference };
    }
    return { status: 'ignored', reason: 'not_final' };
  }

  private async complete(tx: any, settledAmount: number, partial: boolean) {
    await this.offrampState.apply(tx.id, partial ? 'PARTIALLY_SETTLED' : 'COMPLETED', {
      actor: 'safehaven-transfer',
      settledFiatAmount: String(settledAmount),
      reason: partial ? 'partial_settlement' : undefined,
    });
  }

  /** Free the claim so a redelivered credit webhook can retry, and surface the order for manual review. */
  private async releaseForRetry(tx: any, claimKey: string, error: string) {
    await this.prisma.offrampEvent.deleteMany({ where: { eventKey: claimKey } }).catch(() => undefined);
    await this.patchMeta(tx.id, { forwardError: error, needsReview: true });
  }

  private async patchMeta(id: string, patch: Record<string, unknown>) {
    const row = await this.prisma.offrampTransaction.findUnique({ where: { id }, select: { metadata: true } });
    const meta = ((row?.metadata as any) ?? {}) as Record<string, any>;
    await this.prisma.offrampTransaction.update({
      where: { id },
      data: { metadata: { ...meta, safehaven: { ...(meta.safehaven ?? {}), ...patch } } as any },
    });
  }
}
