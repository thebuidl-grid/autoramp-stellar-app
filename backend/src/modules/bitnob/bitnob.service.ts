import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import { createHmac, randomUUID } from 'crypto';
import { BitnobCountryConfig, resolveCountry } from './bitnob-countries';

export interface BitnobCustomerInput {
  firstName?: string;
  lastName?: string;
  email: string;
  phoneNumber?: string;
  /** ISO alpha-2 country; defaults to NG. */
  country?: string;
}

export interface BitnobPayoutQuoteInput {
  fromAsset: string;
  toCurrency: string;
  country: string;
  source: 'onchain' | 'offchain';
  settlementAmount: number;
  reference: string;
  chain: string;
  paymentReason?: string;
}

export interface BitnobPayoutInitializeInput {
  quoteId: string;
  reference: string;
  beneficiary: {
    /** 'mobile_money' pays a phone number on a network (M-Pesa, MTN...); `bankCode` then carries the network. */
    destinationType: 'bank' | 'mobile_money';
    country: string;
    accountName: string;
    accountNumber: string;
    bankCode: string;
  };
  callbackUrl?: string;
  customerId?: string;
  paymentReason?: string;
}

export interface BitnobWithdrawalInput {
  toAddress: string;
  amount: number;
  reference: string;
  memo?: string;
  description?: string;
  currency?: string;
  chain?: string;
}

export interface BitnobVirtualAccountInput {
  reference: string;
  customerId: string;
  currency?: string;
  bank?: string;
  accountAlias?: string;
}

export interface BitnobTradeQuoteInput {
  baseCurrency: string;
  quoteCurrency: string;
  side: 'buy' | 'sell';
  quantity: number;
}

export interface BitnobTradingOrderInput {
  baseCurrency: string;
  quoteCurrency: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  quoteId: string;
  reference: string;
}

export function buildBitnobAuthHeaders(
  clientId: string,
  secret: string,
  body: string | undefined,
): Record<string, string> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = randomUUID();
  const payload = `${clientId}:${timestamp}:${nonce}:${body ?? ''}`;
  const signature = createHmac('sha256', secret).update(payload).digest('hex');
  return {
    'Content-Type': 'application/json',
    'X-Auth-Client': clientId,
    'X-Auth-Timestamp': timestamp,
    'X-Auth-Nonce': nonce,
    'X-Auth-Signature': signature,
  };
}

export function deepPick(
  sources: Array<Record<string, any> | undefined | null>,
  keys: string[],
  maxDepth = 4,
): any {
  const normalizedKeys = keys.map((k) => k.toLowerCase().replace(/[-_]/g, ''));
  const seen = new Set<any>();

  const dfs = (obj: any, depth: number): any => {
    if (!obj || typeof obj !== 'object' || depth > maxDepth || seen.has(obj)) {
      return undefined;
    }
    seen.add(obj);

    for (const [key, value] of Object.entries(obj)) {
      const normalizedKey = key.toLowerCase().replace(/[-_]/g, '');
      if (normalizedKeys.includes(normalizedKey)) {
        return value;
      }
    }
    for (const [, value] of Object.entries(obj)) {
      if (value && typeof value === 'object' && depth < maxDepth) {
        const found = dfs(value, depth + 1);
        if (found !== undefined) return found;
      }
    }
    return undefined;
  };

  for (const source of sources) {
    if (source && typeof source === 'object') {
      const found = dfs(source, 0);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

/**
 * The id used in `/api/payouts/:id/initialize` and `/finalize`. Bitnob now nests the quote under
 * `data.payout` and returns both a human id (`quote_id`, e.g. "QT2_21878422") and a uuid (`id`).
 * The `quote_id` is preferred, as before; older flat shapes are still understood.
 */
export function extractBitnobQuoteId(
  quote: Record<string, any> | undefined | null,
): string | undefined {
  const payout = quote?.data?.payout ?? quote?.payout;
  const id =
    payout?.quote_id ??
    quote?.data?.quote_id ??
    quote?.quote_id ??
    payout?.id ??
    quote?.data?.id ??
    quote?.id;
  return id ? String(id) : undefined;
}

export function extractPayoutDeposit(
  quote: Record<string, any> | undefined,
  initialize: Record<string, any> | undefined,
  finalize: Record<string, any> | undefined,
): {
  paymentAddress?: string;
  amountToPay?: string;
  memo?: string;
  assetCode?: string;
  assetIssuer?: string;
  expiresAt?: string;
} {
  const combined = [finalize, initialize, quote];
  const paymentAddress = deepPick(combined, [
    'payment_address',
    'deposit_address',
    'chain_address',
    'receive_address',
    'payin_address',
    'address',
  ]);
  let amountToPay: any = deepPick(combined, [
    'amount_to_pay',
    'deposit_amount',
    'payin_amount',
    'send_amount',
    'crypto_amount',
    'amount',
  ]);
  if (amountToPay === undefined && quote?.amount !== undefined) {
    amountToPay = quote.amount;
  }
  const memo = deepPick(combined, [
    'memo',
    'payment_memo',
    'chain_memo',
    'payin_memo',
    'tag',
  ]);
  const assetCode = deepPick(combined, [
    'asset_code',
    'assetCode',
    'token_code',
    'tokenCode',
  ]);
  const assetIssuer = deepPick(combined, [
    'asset_issuer',
    'assetIssuer',
    'token_issuer',
    'tokenIssuer',
    'issuer',
  ]);
  const expiresAt = deepPick(combined, [
    'expires_at',
    'expire_at',
    'valid_until',
    'expiry',
    'expired_at',
  ]);
  return {
    paymentAddress: paymentAddress ? String(paymentAddress) : undefined,
    amountToPay: amountToPay !== undefined ? String(amountToPay) : undefined,
    memo: memo ? String(memo) : undefined,
    assetCode: assetCode ? String(assetCode) : undefined,
    assetIssuer: assetIssuer ? String(assetIssuer) : undefined,
    expiresAt: expiresAt ? String(expiresAt) : undefined,
  };
}

@Injectable()
export class BitNobService {
  private readonly logger = new Logger(BitNobService.name);
  private readonly baseUrl: string;
  private readonly clientId?: string;
  private readonly secret?: string;
  private readonly webhookUrl?: string;
  private readonly syntheticKyc: boolean;
  private banksCache = new Map<string, { at: number; items: any[] }>();

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.baseUrl = (
      this.configService.get<string>('BITNOB_API_URL') ||
      'https://api.bitnob.com'
    ).replace(/\/+$/, '');
    this.clientId = this.configService.get<string>('BITNOB_CLIENT_ID')?.trim();
    // BITNOB_KEY is the only signing-secret variable. BITNOB_API_KEY used to be a silent fallback, which let a
    // stale value in one container (e.g. the webhook worker) mask the real key, so it is no longer read.
    this.secret = this.configService.get<string>('BITNOB_KEY')?.trim();
    if (!this.secret && this.configService.get<string>('BITNOB_API_KEY')) {
      this.logger.warn(
        'BITNOB_API_KEY is set but no longer read. Rename it to BITNOB_KEY.',
      );
    }
    this.webhookUrl = this.configService
      .get<string>('BITNOB_WEBHOOK_URL')
      ?.trim();
    this.syntheticKyc =
      (
        this.configService.get<string>('BITNOB_SYNTHETIC_KYC') || 'true'
      ).toLowerCase() === 'true';
  }

  isConfigured(): boolean {
    return Boolean(this.clientId && this.secret);
  }

  private headers(body?: string) {
    if (!this.clientId || !this.secret) {
      throw new HttpException(
        'Bitnob client id or secret not configured',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    return buildBitnobAuthHeaders(this.clientId, this.secret, body);
  }

  private async request<T = any>(
    method: 'get' | 'post' | 'put' | 'delete',
    path: string,
    body?: Record<string, any> | null,
    options: { chainRetry?: boolean } = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const rawBody = body ? JSON.stringify(body) : undefined;
    const headers = this.headers(rawBody);
    try {
      const response = await firstValueFrom(
        this.httpService.request({
          method,
          url,
          data: rawBody,
          headers,
          timeout: 30000,
        }),
      );
      return response.data;
    } catch (error) {
      if (error instanceof ChainRetryError) {
        const response = await firstValueFrom(
          this.httpService.request({
            method,
            url,
            data: JSON.stringify(error.body),
            headers: this.headers(JSON.stringify(error.body)),
            timeout: 30000,
          }),
        );
        return response.data;
      }
      return this.handleHttpError(
        error,
        method,
        path,
        options.chainRetry ? body : undefined,
      );
    }
  }

  private handleHttpError(
    error: unknown,
    method: string,
    path: string,
    originalBody?: Record<string, any> | null,
  ): never {
    if (error instanceof HttpException) throw error;

    if (error instanceof AxiosError) {
      const status = error.response?.status || HttpStatus.BAD_GATEWAY;
      const data = error.response?.data;
      const requestId = data?.metadata?.request_id || data?.request_id;
      const providerMessage =
        data?.message || data?.detail || data?.error?.message || error.message;

      const details = data?.errors ?? data?.error ?? data?.details;
      this.logger.error(
        `Bitnob API error: ${method.toUpperCase()} ${path} status=${status} message=${providerMessage} requestId=${requestId || 'none'}` +
          (details ? ` details=${JSON.stringify(details)}` : ''),
      );

      if (status === HttpStatus.FORBIDDEN) {
        const reason = String(providerMessage || 'forbidden');
        const ipRelated = /\b(ip|whitelist|allowlist)/i.test(reason);
        throw new HttpException(
          `Bitnob API rejected the request with 403: ${reason}` +
            (ipRelated
              ? ' Ensure this egress IP is whitelisted in the Bitnob dashboard.'
              : '') +
            (requestId ? ` (request_id: ${requestId})` : ''),
          HttpStatus.BAD_GATEWAY,
        );
      }

      if (
        status === HttpStatus.BAD_REQUEST &&
        originalBody &&
        path.includes('/payouts')
      ) {
        const msg = String(providerMessage || '').toLowerCase();
        const sentChain = String(originalBody.chain ?? '');
        if (
          msg.includes('chain') &&
          sentChain &&
          sentChain !== sentChain.toLowerCase()
        ) {
          this.logger.warn(
            `Bitnob rejected chain='${sentChain}'; retrying with '${sentChain.toLowerCase()}'`,
          );
          const retryBody = {
            ...originalBody,
            chain: sentChain.toLowerCase(),
          };
          throw new ChainRetryError(retryBody);
        }
      }

      throw new HttpException(
        `Bitnob API error: ${providerMessage || 'unknown error'}` +
          (requestId ? ` (request_id: ${requestId})` : ''),
        status,
      );
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new HttpException(
      `Bitnob API error: ${message}`,
      HttpStatus.BAD_GATEWAY,
    );
  }

  async whoami(): Promise<any> {
    return this.request('post', '/api/whoami', {});
  }

  // ─── Account overview (read-only, for the admin dashboard) ───

  /** Query string from the given params, skipping empty values. Returns '' or '?a=b&c=d'. */
  private static queryString(params: Record<string, string | number | undefined>): string {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') qs.set(key, String(value));
    }
    const out = qs.toString();
    return out ? `?${out}` : '';
  }

  /** Every ledger account with its available and ledger balance. */
  async listBalances(): Promise<any> {
    return this.request('get', '/api/balances');
  }

  /** Our transactions, newest first. Page with the `next_cursor` of the previous page as `cursor`. */
  async listTransactions(
    params: {
      cursor?: string;
      limit?: number;
      currency?: string;
      status?: string;
      type?: string;
      direction?: string;
      reference?: string;
    } = {},
  ): Promise<any> {
    return this.request('get', `/api/transactions${BitNobService.queryString(params)}`);
  }

  /** Our payouts, newest first. */
  async listPayouts(
    params: {
      limit?: number;
      offset?: number;
      status?: string;
      from_asset?: string;
      to_currency?: string;
      source?: string;
    } = {},
  ): Promise<any> {
    return this.request('get', `/api/payouts${BitNobService.queryString(params)}`);
  }

  // ─── Payouts / offramp ───

  async createPayoutQuote(input: BitnobPayoutQuoteInput): Promise<any> {
    if (
      !Number.isFinite(input.settlementAmount) ||
      input.settlementAmount <= 0
    ) {
      throw new BadRequestException(
        'settlementAmount must be a positive number',
      );
    }
    const body: Record<string, any> = {
      from_asset: input.fromAsset,
      to_currency: input.toCurrency,
      country: input.country,
      source: input.source,
      // Bitnob validates this as a decimal STRING: a JSON number is rejected with
      // 400 "Invalid request body" (every quote and every off-ramp failed on this).
      settlement_amount: String(input.settlementAmount),
      chain: input.chain,
      reference: input.reference,
    };
    if (input.paymentReason) body.payment_reason = input.paymentReason;
    return this.request('post', '/api/payouts/quotes', body, {
      chainRetry: true,
    });
  }

  async initializePayout(input: BitnobPayoutInitializeInput): Promise<any> {
    const body: Record<string, any> = {
      quote_id: input.quoteId,
      reference: input.reference,
      beneficiary: {
        destination_type: input.beneficiary.destinationType,
        country: input.beneficiary.country,
        account_name: input.beneficiary.accountName,
        account_number: input.beneficiary.accountNumber,
        // Mobile money is addressed by network, not bank code.
        ...(input.beneficiary.destinationType === 'mobile_money'
          ? { network: input.beneficiary.bankCode.toLowerCase() }
          : { bank_code: input.beneficiary.bankCode }),
      },
    };
    if (input.callbackUrl) body.callback_url = input.callbackUrl;
    if (input.customerId) body.customer_id = input.customerId;
    if (input.paymentReason) body.payment_reason = input.paymentReason;
    return this.request(
      'post',
      `/api/payouts/${input.quoteId}/initialize`,
      body,
    );
  }

  async finalizePayout(quoteId: string): Promise<any> {
    return this.request('post', `/api/payouts/${quoteId}/finalize`, null);
  }

  /** Current state of a payout (used by the manual "I've made the transfer" check). */
  async getPayout(payoutId: string): Promise<any> {
    return this.request('get', `/api/payouts/${encodeURIComponent(payoutId)}`);
  }

  /** Current state of a payout by our own reference. Unlike `/api/payouts/:id`, this accepts the reference
   * supplied when creating the quote and works even when only the quote id was persisted locally. */
  async getPayoutByReference(reference: string): Promise<any> {
    return this.request(
      'get',
      `/api/payouts/reference/${encodeURIComponent(reference)}`,
    );
  }

  async accountLookup(
    bankCode: string,
    accountNumber: string,
    country = 'NG',
    type: 'bank' | 'mobile_money' = 'bank',
  ): Promise<any> {
    try {
      // For mobile money, Bitnob wants type=mobile_money and the network passed as bank_code.
      const query = new URLSearchParams({
        country,
        account_number: accountNumber,
        bank_code: bankCode,
        ...(type === 'mobile_money' ? { type } : {}),
      }).toString();
      return await this.request(
        'get',
        `/api/payouts/account-lookup?${query}`,
        null,
      );
    } catch (error) {
      this.logger.warn(
        `Bitnob account lookup failed for ${bankCode}/${accountNumber}`,
      );
      throw error;
    }
  }

  async listBanks(country = 'NG'): Promise<any[]> {
    const now = Date.now();
    country = resolveCountry(country).code;
    const cached = this.banksCache.get(country);
    if (cached && now - cached.at < 10 * 60 * 1000) {
      return cached.items;
    }
    let items: any[] = [];
    try {
      // Country is a path segment; as a query param Bitnob parses it as an id ("invalid UUID").
      const data = await this.request(
        'get',
        `/api/payouts/banks/${encodeURIComponent(country)}`,
        null,
      );
      const payload = data?.data;
      items = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.banks)
          ? payload.banks
          : [];
    } catch (error) {
      this.logger.warn(
        `Bitnob listBanks failed for ${country}: ${(error as Error)?.message}`,
      );
    }
    // Kenya has no banks (mobile money only) and Ghana has both. Outside Nigeria, always add the country's
    // mobile money networks; in Nigeria only if the bank list came back empty.
    if (country !== 'NG' || items.length === 0) {
      const mobile = await this.listMobileMoneyNetworks(country);
      const seen = new Set(items.map((b: any) => String(b?.code ?? b?.bank_code ?? '').toLowerCase()));
      items = [...items, ...mobile.filter((m) => !seen.has(String(m.code).toLowerCase()))];
    }
    if (items.length === 0) {
      this.logger.warn(
        `Bitnob has no banks or mobile money networks for ${country}`,
      );
      return []; // not cached, so a recovered API is picked up straight away
    }
    this.banksCache.set(country, { at: now, items });
    return items;
  }

  /** Beneficiary requirements for a payout country (destination types, their fields and options). */
  async getCountryRequirements(country: string): Promise<any | null> {
    try {
      const data = await this.request(
        'get',
        `/api/payouts/supported-countries/${encodeURIComponent(country)}`,
        null,
      );
      return data?.data ?? data ?? null;
    } catch (error) {
      this.logger.warn(
        `Bitnob country requirements failed for ${country}: ${(error as Error)?.message}`,
      );
      return null;
    }
  }

  /** Mobile money networks for a country, shaped like bank rows ({ code, name, destinationType }). */
  async listMobileMoneyNetworks(country: string): Promise<any[]> {
    const req = await this.getCountryRequirements(country);
    return BitNobService.extractMobileMoneyNetworks(req);
  }

  /**
   * Pull the mobile money networks out of a country-requirements payload, whichever way Bitnob lists them: a
   * `banks` array on the destination type, or the options of its `network` (or `bank_code`) field.
   */
  static extractMobileMoneyNetworks(req: any): any[] {
    const dest = req?.destination_types?.mobile_money ?? req?.destinationTypes?.mobile_money;
    if (!dest) return [];
    const rows: Array<{ code: string; name: string }> = [];
    if (Array.isArray(dest.banks)) {
      for (const b of dest.banks) {
        if (b?.code) rows.push({ code: String(b.code), name: String(b.name ?? b.code) });
      }
    }
    if (rows.length === 0 && Array.isArray(dest.fields)) {
      const field = dest.fields.find((f: any) => f?.key === 'network' || f?.key === 'bank_code');
      for (const o of field?.options ?? []) {
        if (o?.value) rows.push({ code: String(o.value), name: String(o.label ?? o.value) });
      }
    }
    return rows.map((r) => ({ ...r, bank_code: r.code, destinationType: 'mobile_money' }));
  }

  /** 'mobile_money' when `code` is one of the country's mobile money networks and not a bank; otherwise 'bank'. */
  async destinationTypeFor(
    country: string,
    code: string,
  ): Promise<'bank' | 'mobile_money'> {
    const items = await this.listBanks(country);
    const match = items.find(
      (b: any) =>
        String(b?.code ?? b?.bank_code ?? '').toLowerCase() === String(code).toLowerCase(),
    );
    return match?.destinationType === 'mobile_money' ? 'mobile_money' : 'bank';
  }

  async bitnobBankName(
    bankCode: string,
    country = 'NG',
  ): Promise<string | undefined> {
    const banks = await this.listBanks(country);
    const match = banks.find(
      (b: any) => b?.code === bankCode || b?.bank_code === bankCode,
    );
    return match?.name || match?.bank_name;
  }

  // ─── Customers / virtual accounts ───

  /** Nigerian local format (0XXXXXXXXXX), as the original synthetic KYC sent with dial_code +234; null if unusable. */
  static normalizeNgPhone(raw?: string | null): string | null {
    if (!raw) return null;
    let d = String(raw).replace(/\D/g, '');
    if (d.startsWith('234')) d = d.slice(3);
    d = d.replace(/^0+/, '');
    return d.length === 10 ? `0${d}` : null;
  }

  private synthesizeCustomer(
    input: BitnobCustomerInput,
    country: BitnobCountryConfig,
  ) {
    const email = input.email;
    const hash = createHmac('sha256', email).update(email).digest('hex');
    const bvn = hash
      .slice(0, 11)
      .replace(/[^0-9]/g, '')
      .padStart(11, '0')
      .slice(0, 11);
    const phoneHash = hash.slice(11, 20).replace(/[^0-9]/g, '');
    const fallbackPhone = `${country.code === 'NG' ? '080' : '070'}${phoneHash.padStart(9, '0').slice(0, 9)}`;
    const phoneNumber =
      (country.code === 'NG'
        ? BitNobService.normalizeNgPhone(input.phoneNumber)
        : input.phoneNumber) || fallbackPhone;
    const dialCode = country.dialCode;
    return {
      customer_type: 'individual',
      first_name: input.firstName || email.split('@')[0],
      last_name: input.lastName || 'Customer',
      email,
      phone_number: phoneNumber,
      dial_code: dialCode,
      date_of_birth: '1990-01-01',
      id_type: country.idType,
      id_number: bvn,
      country: country.iso3,
    };
  }

  /** Bitnob rejects names containing digits/symbols; keep letters, spaces, hyphens, apostrophes. */
  static sanitizeName(name: string | undefined | null, fallback: string): string {
    const cleaned = (name ?? '')
      .replace(/[^\p{L}\s'-]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned || fallback;
  }

  async createCustomer(input: BitnobCustomerInput): Promise<any> {
    input = {
      ...input,
      firstName: BitNobService.sanitizeName(
        input.firstName || input.email?.split('@')[0],
        'Customer',
      ),
      lastName: BitNobService.sanitizeName(input.lastName, 'Customer'),
    };
    const country = resolveCountry(input.country);
    const body = this.syntheticKyc
      ? this.synthesizeCustomer(input, country)
      : {
          customer_type: 'individual',
          first_name: input.firstName,
          last_name: input.lastName,
          email: input.email,
          ...(BitNobService.normalizeNgPhone(input.phoneNumber)
            ? {
                dial_code: '+234',
                phone_number: BitNobService.normalizeNgPhone(input.phoneNumber),
              }
            : {}),
        };
    return this.request('post', '/api/customers', body);
  }

  async createVirtualAccount(input: BitnobVirtualAccountInput): Promise<any> {
    const body: Record<string, any> = {
      reference: input.reference,
      currency: input.currency || 'NGN',
      customer_id: input.customerId,
    };
    if (input.bank) body.bank = input.bank;
    if (input.accountAlias) body.account_alias = input.accountAlias;
    return this.request('post', '/api/virtual-accounts', body);
  }

  async simulateDeposit(
    virtualAccountId: string,
    amountKobo?: number,
  ): Promise<any> {
    const path = `/api/virtual-accounts/${virtualAccountId}/simulate-deposit`;
    const body: Record<string, any> = {};
    if (amountKobo) body.amount = amountKobo;
    try {
      return await this.request('post', path, body);
    } catch (error) {
      this.logger.warn(
        `Bitnob simulateDeposit failed: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  // ─── Trading / withdrawals ───

  /** Bitnob wants decimals as strings. Rejects NaN, Infinity, zero and negatives before any request. */
  private static decimalString(value: number | string, field: string): string {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) {
      throw new BadRequestException(`${field} must be a positive number`);
    }
    return String(typeof value === 'string' ? value.trim() : value);
  }

  async tradingQuote(input: BitnobTradeQuoteInput): Promise<any> {
    return this.request('post', '/api/trading/quotes', {
      base_currency: input.baseCurrency,
      quote_currency: input.quoteCurrency,
      side: input.side,
      // Decimal STRING: a JSON number is rejected with 400 "Invalid request body".
      quantity: BitNobService.decimalString(input.quantity, 'quantity'),
    });
  }

  async tradingOrder(input: BitnobTradingOrderInput): Promise<any> {
    return this.request('post', '/api/trading/orders', {
      base_currency: input.baseCurrency,
      quote_currency: input.quoteCurrency,
      side: input.side,
      // Both must be decimal strings: numbers (or a mix) are rejected with 400 "Invalid request body".
      quantity: BitNobService.decimalString(input.quantity, 'quantity'),
      price: BitNobService.decimalString(input.price, 'price'),
      quote_id: input.quoteId,
      reference: input.reference,
    });
  }

  async createWithdrawal(input: BitnobWithdrawalInput): Promise<any> {
    const body: Record<string, any> = {
      to_address: input.toAddress,
      amount: String(input.amount),
      currency: input.currency || 'USDC',
      chain: input.chain || 'stellar',
      reference: input.reference,
    };
    if (input.memo !== undefined) body.memo = input.memo;
    if (input.description) body.description = input.description;
    return this.request('post', '/api/withdrawals', body);
  }

  getWebhookUrl(): string | undefined {
    return this.webhookUrl;
  }
}

class ChainRetryError extends Error {
  constructor(public readonly body: Record<string, any>) {
    super('Chain retry requested');
  }
}
