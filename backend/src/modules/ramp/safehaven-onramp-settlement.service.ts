import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { BitNobWebhookService } from '../bitnob/bitnob-webhook.service';
import { PrismaService } from '../../database/prisma.service';
import { MFBService } from '../safehaven/safehaven.service';
import { isSafehavenNgnSettlementEnabled } from './safehaven-settlement.flag';

export interface SafehavenDepositAccount {
  provider: 'safehaven';
  accountNumber: string;
  accountName: string;
  bankCode: string;
  bankName?: string;
}

/**
 * NGN on-ramp through SafeHaven, with no Bitnob customers or virtual accounts.
 *
 *   user pays NGN ─▶ per-order SafeHaven virtual account ─▶ account.credit webhook
 *     ─▶ Bitnob trading against Autoramp's own balance (quote → order NGN→USDC)
 *     ─▶ Bitnob withdrawal of the USDC to the user's wallet
 *
 * The NGN stays in SafeHaven; Autoramp's Bitnob NGN balance is the float the trade draws on and is topped up separately.
 */
@Injectable()
export class SafehavenOnrampSettlementService {
  private readonly logger = new Logger(SafehavenOnrampSettlementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly safehaven: MFBService,
    // Resolved lazily: BitNobModule already imports this module, so a constructor import would be circular.
    private readonly moduleRef: ModuleRef,
  ) {}

  isEnabledFor(countryCode: string, isMerchant: boolean): boolean {
    return isSafehavenNgnSettlementEnabled(this.config, countryCode, isMerchant);
  }

  /** Per-order virtual account the user pays the NGN into. */
  async createDepositAccount(reference: string, amount: number): Promise<SafehavenDepositAccount> {
    const res = await this.safehaven.createVirtualAccount({
      validFor: 6 * 60 * 60,
      callbackUrl: this.config.get<string>('SH_WEBHOOK_URL') || '',
      amount,
      // Users may pay slightly more or less than the order; the credited amount is what gets converted.
      amountControl: 'OverPayment',
      externalReference: reference,
    });
    const acct = res?.data || res;
    if (!acct?.accountNumber) {
      throw new Error('SafeHaven did not return a virtual account number');
    }
    return {
      provider: 'safehaven',
      accountNumber: String(acct.accountNumber),
      accountName: String(acct.accountName ?? ''),
      bankCode: String(acct.bankCode || this.config.get<string>('SAFEHAVEN_BANK_CODE') || ''),
      bankName: acct.bankName ?? undefined,
    };
  }

  async findByDepositAccount(accountNumber?: string | null) {
    if (!accountNumber) return null;
    return this.prisma.onrampTransaction.findFirst({
      where: { metadata: { path: ['safehaven', 'accountNumber'], equals: accountNumber } },
    });
  }

  /** NGN reached the SafeHaven deposit account: run the Bitnob trade + USDC payout for the order (once). */
  async settleCredit(tx: any, credit: { amount?: number | string }) {
    const credited = Number(credit.amount);
    if (!Number.isFinite(credited) || credited <= 0) {
      return { status: 'ignored', reason: 'invalid_credit_amount' };
    }
    if (tx.status !== 'PENDING') {
      return { status: 'ignored', reason: `order_${tx.status}` };
    }

    // Atomic claim: only the first credit webhook for this order proceeds (redeliveries are no-ops).
    const claimedAt = new Date().toISOString();
    const claimed = await this.prisma.$executeRaw`
      UPDATE onramp_transactions
      SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{safehaven,settlementClaimedAt}', to_jsonb(${claimedAt}::text), true)
      WHERE id = ${tx.id}::uuid AND (metadata->'safehaven'->>'settlementClaimedAt') IS NULL`;
    if (!claimed) return { status: 'ignored', reason: 'already_settling' };

    await this.patchMeta(tx.id, { credited });
    try {
      const trader = this.moduleRef.get(BitNobWebhookService, { strict: false });
      await trader.startOnrampFromFiat(tx, credited);
      this.logger.log(`[safehaven-onramp] ${credited} NGN credited for ${tx.reference}; Bitnob trade started`);
      // The user has been served from Autoramp's Bitnob float; refill it with the NGN they just paid.
      await this.replenishFloat(tx, credited);
      return { status: 'success', reference: tx.reference, credited };
    } catch (error: any) {
      // The pipeline has already marked the order FAILED; the NGN is sitting in SafeHaven, so flag it for ops.
      this.logger.error(`[safehaven-onramp] settlement failed for ${tx.reference}: ${error?.message}`);
      await this.patchMeta(tx.id, { settlementError: error?.message ?? 'settlement failed', needsReview: true });
      return { status: 'failed', reference: tx.reference, error: error?.message };
    }
  }

  /**
   * Autoramp's Bitnob NGN balance funds the trade, but the user's NGN lands in SafeHaven. After a successful
   * trade, send the credited NGN from SafeHaven to Autoramp's own Bitnob NGN funding account so the float is
   * refilled. Off until BITNOB_FUNDING_ACCOUNT_NUMBER is set. Never fails the order (the user already got USDC);
   * a failure is flagged on the order (floatError) for ops. Once only, via an atomic claim.
   */
  async replenishFloat(tx: any, amount: number) {
    const accountNumber = this.config.get<string>('BITNOB_FUNDING_ACCOUNT_NUMBER')?.trim();
    if (!accountNumber) return { status: 'skipped', reason: 'funding_account_not_configured' };
    const bankCode = this.config.get<string>('BITNOB_FUNDING_BANK_CODE')?.trim() || '000027'; // Globus Bank (Bitnob NGN)
    const paymentReference = `${tx.reference}-FLOAT`;

    const claimed = await this.prisma.$executeRaw`
      UPDATE onramp_transactions
      SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{safehaven,floatReference}', to_jsonb(${paymentReference}::text), true)
      WHERE id = ${tx.id}::uuid AND (metadata->'safehaven'->>'floatReference') IS NULL`;
    if (!claimed) return { status: 'ignored', reason: 'already_replenished' };

    try {
      await this.safehaven.transfer(
        {
          beneficiaryBankCode: bankCode,
          beneficiaryAccountNumber: accountNumber,
          amount,
          narration: `Autoramp float ${tx.reference}`,
          paymentReference,
        },
        { transactionId: tx.id, type: 'ONRAMP' },
      );
      this.logger.log(`[safehaven-onramp] refilled Bitnob float with ${amount} NGN for ${tx.reference}`);
      return { status: 'success', amount };
    } catch (error: any) {
      // Release the claim so ops can retry, and flag it. The order itself stays as is.
      await this.prisma.$executeRaw`
        UPDATE onramp_transactions
        SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{safehaven,floatReference}', 'null'::jsonb, true)
        WHERE id = ${tx.id}::uuid`;
      this.logger.error(`[safehaven-onramp] float refill failed for ${tx.reference}: ${error?.message}`);
      await this.patchMeta(tx.id, { floatError: error?.message ?? 'float refill failed' });
      return { status: 'failed', error: error?.message };
    }
  }

  private async patchMeta(id: string, patch: Record<string, unknown>) {
    const row = await this.prisma.onrampTransaction.findUnique({ where: { id }, select: { metadata: true } });
    const meta = ((row?.metadata as any) ?? {}) as Record<string, any>;
    await this.prisma.onrampTransaction.update({
      where: { id },
      data: { metadata: { ...meta, safehaven: { ...(meta.safehaven ?? {}), ...patch } } as any },
    });
  }
}
