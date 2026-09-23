import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import { RampProcessor, RampProcessorCorridorContext, RampProcessorTransaction } from '../ramp-processor.interface';

const PAYSTACK_BASE_URL = 'https://api.paystack.co';

/**
 * Per-currency quirks Paystack's API needs on every call — confirmed via
 * their docs: DVAs and Transfers both support NGN and GHS (GHS transfers
 * route over GhIPSS, https://paystack.com/blog/product/transfers-in-gh).
 *
 * KES offramp uses Transfers (confirmed: https://paystack.com/blog/product/transfers-in-ke),
 * with recipient type 'mobile_money' for M-Pesa (bank_code = telco code e.g.
 * Safaricom, account_number = phone number). Kenyan bank-account
 * (non-mobile-money) recipients may need a different type; not yet
 * confirmed against Paystack's docs, so not encoded here. KES onramp does
 * NOT use this config at all — see MOBILE_MONEY_ONRAMP_CURRENCIES below,
 * it goes through the Charge API instead of DVAs.
 */
const CURRENCY_CONFIG: Record<string, { country: string; recipientType: string }> = {
  NGN: { country: 'nigeria', recipientType: 'nuban' },
  GHS: { country: 'ghana', recipientType: 'ghipss' },
  KES: { country: 'kenya', recipientType: 'mobile_money' },
};

/**
 * Currencies whose onramp collection goes through Paystack's Charge API
 * (`POST /charge` with a `mobile_money` object, e.g. `provider: 'mpesa'`)
 * instead of Dedicated Virtual Accounts — because DVA currency is currently
 * limited to NGN and GHS only, confirmed against Paystack's docs. Exported
 * so SwapService.getActiveCorridors can tell the frontend which onramp UI
 * to render (phone-number push vs. bank-transfer deposit account) without
 * needing to know about `rampProcessorProvider` internals.
 */
export const MOBILE_MONEY_ONRAMP_CURRENCIES = new Set(['KES']);

/**
 * Paystack implementation of RampProcessor.
 *
 * Unlike Flint, Paystack has no Stellar awareness at all — which is
 * exactly the point (see ramp-processor.interface.ts): the NGN bank-rail
 * leg never needs to know about Stellar, since AutoRamp handles minting
 * and deposit detection itself.
 *
 * Structural difference from Flint worth knowing: Paystack's Dedicated
 * Virtual Account (DVA) model assigns a PERSISTENT account per customer,
 * not a fresh one-time deposit address per transaction. A customer keeps
 * the same account number across all their onramps. This means:
 *  - initiateOnramp creates (or reuses) a customer + DVA rather than a
 *    fresh deposit address, and returns that persistent account number.
 *  - There's no processor-generated reference to match a webhook back to
 *    a specific transaction — matching happens by account number instead
 *    (see WebhookService.processPaystackWebhook).
 *
 * This single instance serves MULTIPLE corridors on the same Paystack
 * account (e.g. NG/NGN and GH/GHS simultaneously) — every method accepts
 * an optional currency/countryCode context rather than assuming NGN.
 * KE/KES also routes here: offramp uses Transfers like NGN/GHS, but onramp
 * is structurally different — see initiateMobileMoneyCharge below and
 * MOBILE_MONEY_ONRAMP_CURRENCIES.
 *
 * NOTE: built against Paystack's documented API shape; not yet exercised
 * against their live sandbox (no credentials available here). Verify
 * against a real test API key before trusting this in production — same
 * caveat this session applied to Flint. This is especially true for
 * initiateMobileMoneyCharge: the exact `data.status`/`data.display_text`
 * shape Paystack returns synchronously from `POST /charge` for an M-Pesa
 * charge, and whether KES amounts are minor-unit (x100, like kobo/pesewas)
 * or major-unit, are both assumed from docs/blog posts, not a live call.
 */
@Injectable()
export class PaystackRampProcessor implements RampProcessor {
  private readonly logger = new Logger(PaystackRampProcessor.name);
  private readonly secretKey: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.secretKey = this.configService.get<string>('PAYSTACK_SECRET_KEY') || '';
    if (!this.secretKey) {
      throw new HttpException('PAYSTACK_SECRET_KEY missing in config', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  private get headers() {
    return { Authorization: `Bearer ${this.secretKey}`, 'Content-Type': 'application/json' };
  }

  private currencyConfig(currency?: string): { currency: string; country: string; recipientType: string } {
    const cur = (currency || 'NGN').toUpperCase();
    const known = CURRENCY_CONFIG[cur];
    if (!known) {
      throw new HttpException(
        `PaystackRampProcessor has no country/recipient-type mapping for currency ${cur}`,
        HttpStatus.BAD_REQUEST,
      );
    }
    return { currency: cur, ...known };
  }

  /**
   * 'test-bank' only works with test-mode keys for NGN (Paystack's
   * documented sandbox default). Other currencies have no such documented
   * default, so PAYSTACK_DVA_PREFERRED_BANK_<CURRENCY> is required rather
   * than guessed — set it from Paystack's Fetch Providers endpoint for
   * that currency.
   */
  private getPreferredBank(currency: string): string {
    if (currency === 'NGN') {
      return (
        this.configService.get<string>('PAYSTACK_DVA_PREFERRED_BANK_NGN') ||
        this.configService.get<string>('PAYSTACK_DVA_PREFERRED_BANK') || // legacy single-currency name
        'test-bank'
      );
    }
    const key = `PAYSTACK_DVA_PREFERRED_BANK_${currency}`;
    const bank = this.configService.get<string>(key);
    if (!bank) {
      throw new HttpException(
        `${key} missing in config — required to create a Paystack DVA for ${currency}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    return bank;
  }

  async getBanks(params?: RampProcessorCorridorContext): Promise<any> {
    const { country, currency } = this.currencyConfig(params?.currency);
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${PAYSTACK_BASE_URL}/bank`, {
          headers: this.headers,
          params: { country, currency },
        }),
      );
      return response.data;
    } catch (error) {
      this.handleError('Failed to fetch banks', error);
    }
  }

  async resolveAccount(bankCode: string, accountNumber: string): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${PAYSTACK_BASE_URL}/bank/resolve`, {
          headers: this.headers,
          params: { account_number: accountNumber, bank_code: bankCode },
        }),
      );
      return response.data;
    } catch (error) {
      this.handleError('Failed to resolve account', error);
    }
  }

  async initiateOnramp(
    params: {
      reference: string;
      amount: number;
      destinationAddress: string;
      notifyUrl?: string;
      userEmail?: string;
      phoneNumber?: string;
    } & RampProcessorCorridorContext,
  ): Promise<RampProcessorTransaction> {
    const { currency } = this.currencyConfig(params.currency);

    if (MOBILE_MONEY_ONRAMP_CURRENCIES.has(currency)) {
      return this.initiateMobileMoneyCharge({ ...params, currency });
    }

    if (!params.userEmail) {
      throw new HttpException(
        "Paystack's Dedicated Virtual Account model requires a user email to create/reuse a customer",
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const customerCode = await this.getOrCreateCustomer(params.userEmail);
      const account = await this.getOrCreateDedicatedAccount(customerCode, currency);

      return {
        providerTransactionId: null, // no per-transaction ID until an actual deposit lands
        depositAccount: {
          bankName: account.bank?.name,
          accountNumber: account.account_number,
          accountName: account.account_name,
        },
        raw: { customerCode, account },
      };
    } catch (error) {
      this.handleError('Failed to initialise onramp (Paystack DVA)', error);
    }
  }

  /**
   * KES onramp: Paystack's Charge API (not DVA) with a `mobile_money`
   * object triggers an M-Pesa STK push directly to the payer's phone —
   * confirmed supported for Kenya via multiple sources referencing
   * Paystack's Charge API docs (https://paystack.com/docs/api/charge/):
   * `provider: 'mpesa'`, phone in +254 international format. Unlike DVA,
   * we choose the `reference` ourselves and Paystack echoes it back on the
   * `charge.success` webhook (`channel: 'mobile_money'`) — matched by
   * WebhookService.processPaystackWebhook, no account-number lookup needed.
   *
   * There's no persistent deposit account here (that's the whole point of
   * a push flow), so depositAccount is always null; collectionMethod tells
   * callers/the frontend to show a "check your phone" prompt instead.
   */
  private async initiateMobileMoneyCharge(
    params: {
      reference: string;
      amount: number;
      userEmail?: string;
      phoneNumber?: string;
      currency: string;
    },
  ): Promise<RampProcessorTransaction> {
    if (!params.phoneNumber) {
      throw new HttpException(
        `A phoneNumber is required to collect ${params.currency} via M-Pesa (Paystack Charge API)`,
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!params.userEmail) {
      throw new HttpException(
        "Paystack's Charge API requires a customer email even for mobile money charges",
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${PAYSTACK_BASE_URL}/charge`,
          {
            email: params.userEmail,
            amount: Math.round(params.amount * 100), // major unit -> minor unit, same x100 convention as NGN/GHS
            currency: params.currency,
            reference: params.reference,
            mobile_money: { phone: params.phoneNumber, provider: 'mpesa' },
          },
          { headers: this.headers },
        ),
      );

      const data = response.data?.data;
      return {
        providerTransactionId: params.reference,
        depositAccount: null,
        collectionMethod: 'mobile_money_push',
        displayMessage: data?.display_text,
        raw: response.data,
      };
    } catch (error) {
      this.handleError('Failed to initialise onramp (Paystack M-Pesa charge)', error);
    }
  }

  async executeOfframpPayout(
    params: {
      reference: string;
      amount: number;
      bankCode: string;
      accountNumber: string;
      notifyUrl?: string;
    } & RampProcessorCorridorContext,
  ): Promise<RampProcessorTransaction> {
    const { currency, recipientType } = this.currencyConfig(params.currency);

    try {
      const recipientRes = await firstValueFrom(
        this.httpService.post(
          `${PAYSTACK_BASE_URL}/transferrecipient`,
          {
            type: recipientType,
            name: 'AutoRamp Offramp',
            account_number: params.accountNumber,
            bank_code: params.bankCode,
            currency,
          },
          { headers: this.headers },
        ),
      );
      const recipientCode = recipientRes.data?.data?.recipient_code;
      if (!recipientCode) {
        throw new Error('Paystack did not return a recipient_code');
      }

      const transferRes = await firstValueFrom(
        this.httpService.post(
          `${PAYSTACK_BASE_URL}/transfer`,
          {
            source: 'balance',
            amount: Math.round(params.amount * 100), // major unit -> minor unit (kobo/pesewas), both x100
            recipient: recipientCode,
            reason: 'AutoRamp offramp',
            reference: params.reference,
          },
          { headers: this.headers },
        ),
      );

      const transferCode = transferRes.data?.data?.transfer_code;

      return {
        providerTransactionId: transferCode || null,
        depositAccount: null,
        raw: { recipientCode, transfer: transferRes.data },
      };
    } catch (error) {
      this.handleError('Failed to initialise offramp (Paystack transfer)', error);
    }
  }

  private async getOrCreateCustomer(email: string): Promise<string> {
    try {
      const existing = await firstValueFrom(
        this.httpService.get(`${PAYSTACK_BASE_URL}/customer/${encodeURIComponent(email)}`, {
          headers: this.headers,
        }),
      );
      const code = existing.data?.data?.customer_code;
      if (code) return code;
    } catch {
      // 404 (not found) is the expected path for a first-time customer —
      // fall through to create one below.
    }

    const created = await firstValueFrom(
      this.httpService.post(`${PAYSTACK_BASE_URL}/customer`, { email }, { headers: this.headers }),
    );
    const code = created.data?.data?.customer_code;
    if (!code) throw new Error('Paystack did not return a customer_code');
    return code;
  }

  private async getOrCreateDedicatedAccount(customerCode: string, currency: string): Promise<any> {
    try {
      const existing = await firstValueFrom(
        this.httpService.get(`${PAYSTACK_BASE_URL}/customer/${customerCode}`, { headers: this.headers }),
      );
      const dedicatedAccount = existing.data?.data?.dedicated_account;
      if (dedicatedAccount?.account_number && dedicatedAccount?.currency === currency) {
        return dedicatedAccount;
      }
    } catch (error: any) {
      this.logger.warn(`Could not check for existing DVA, will attempt to create one: ${error.message}`);
    }

    const created = await firstValueFrom(
      this.httpService.post(
        `${PAYSTACK_BASE_URL}/dedicated_account`,
        { customer: customerCode, preferred_bank: this.getPreferredBank(currency), currency },
        { headers: this.headers },
      ),
    );
    const account = created.data?.data;
    if (!account?.account_number) {
      throw new Error('Paystack did not return a dedicated account');
    }
    return account;
  }

  private handleError(message: string, error: AxiosError | unknown): never {
    let status = HttpStatus.BAD_GATEWAY;
    let errorMessage = 'Unknown error';
    if (error instanceof AxiosError) {
      status = error.response?.status || status;
      const dataMessage = (error.response?.data as any)?.message;
      errorMessage = dataMessage || error.message || errorMessage;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    throw new HttpException(`${message}: ${errorMessage}`, status);
  }
}
