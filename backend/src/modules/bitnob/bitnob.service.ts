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

export interface BitnobCustomerInput {
  firstName?: string;
  lastName?: string;
  email: string;
  phoneNumber?: string;
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
    destinationType: 'bank';
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
  private banksCache?: { at: number; items: any[] };

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.baseUrl = (
      this.configService.get<string>('BITNOB_API_URL') ||
      'https://api.bitnob.com'
    ).replace(/\/+$/, '');
    this.clientId = this.configService.get<string>('BITNOB_CLIENT_ID')?.trim();
    this.secret =
      this.configService.get<string>('BITNOB_KEY')?.trim() ||
      this.configService.get<string>('BITNOB_API_KEY')?.trim();
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

      this.logger.error(
        `Bitnob API error: ${method.toUpperCase()} ${path} status=${status} message=${providerMessage} requestId=${requestId || 'none'}`,
      );

      if (status === HttpStatus.FORBIDDEN) {
        throw new HttpException(
          `Bitnob API rejected the request with 403 (IP not whitelisted or insufficient permission). Ensure this egress IP is whitelisted in the Bitnob dashboard.`,
          HttpStatus.BAD_GATEWAY,
        );
      }

      if (
        status === HttpStatus.BAD_REQUEST &&
        originalBody &&
        path.includes('/payouts')
      ) {
        const msg = String(providerMessage || '').toLowerCase();
        if (
          msg.includes('chain') &&
          originalBody.chain?.toLowerCase() === 'stellar'
        ) {
          this.logger.warn(
            `Bitnob rejected chain='STELLAR'; retrying with 'stellar'`,
          );
          const retryBody = { ...originalBody, chain: 'stellar' };
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

  // ─── Payouts / offramp ───

  async createPayoutQuote(input: BitnobPayoutQuoteInput): Promise<any> {
    const body: Record<string, any> = {
      from_asset: input.fromAsset,
      to_currency: input.toCurrency,
      country: input.country,
      source: input.source,
      settlement_amount: input.settlementAmount,
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
        bank_code: input.beneficiary.bankCode,
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

  async accountLookup(
    bankCode: string,
    accountNumber: string,
    country = 'NG',
  ): Promise<any> {
    try {
      return await this.request('post', '/api/payouts/account-lookup', {
        country,
        bank_code: bankCode,
        account_number: accountNumber,
      });
    } catch (error) {
      this.logger.warn(
        `Bitnob account lookup failed for ${bankCode}/${accountNumber}`,
      );
      throw error;
    }
  }

  async listBanks(country = 'NG'): Promise<any[]> {
    const now = Date.now();
    if (this.banksCache && now - this.banksCache.at < 10 * 60 * 1000) {
      return this.banksCache.items;
    }
    try {
      const data = await this.request(
        'get',
        `/api/payouts/banks?country=${country}`,
        null,
      );
      const items = Array.isArray(data?.data) ? data.data : [];
      this.banksCache = { at: now, items };
      return items;
    } catch (error) {
      this.logger.warn('Bitnob listBanks failed; falling back to empty cache');
      return [];
    }
  }

  async bitnobBankName(bankCode: string): Promise<string | undefined> {
    const banks = await this.listBanks();
    const match = banks.find(
      (b: any) => b?.code === bankCode || b?.bank_code === bankCode,
    );
    return match?.name || match?.bank_name;
  }

  // ─── Customers / virtual accounts ───

  private synthesizeCustomer(input: BitnobCustomerInput) {
    const email = input.email;
    const hash = createHmac('sha256', email).update(email).digest('hex');
    const bvn = hash
      .slice(0, 11)
      .replace(/[^0-9]/g, '')
      .padStart(11, '0')
      .slice(0, 11);
    const phoneHash = hash.slice(11, 20).replace(/[^0-9]/g, '');
    const fallbackPhone = `080${phoneHash.padStart(9, '0').slice(0, 9)}`;
    const phoneNumber = input.phoneNumber || fallbackPhone;
    const dialCode = '+234';
    return {
      first_name: input.firstName || email.split('@')[0],
      last_name: input.lastName || 'Customer',
      email,
      phone_number: phoneNumber,
      dial_code: dialCode,
      date_of_birth: '1990-01-01',
      id_type: 'bvn',
      id_number: bvn,
      country: 'NGA',
    };
  }

  async createCustomer(input: BitnobCustomerInput): Promise<any> {
    const body = this.syntheticKyc
      ? this.synthesizeCustomer(input)
      : {
          first_name: input.firstName,
          last_name: input.lastName,
          email: input.email,
          phone_number: input.phoneNumber,
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

  async tradingQuote(input: BitnobTradeQuoteInput): Promise<any> {
    return this.request('post', '/api/trading/quotes', {
      base_currency: input.baseCurrency,
      quote_currency: input.quoteCurrency,
      side: input.side,
      quantity: input.quantity,
    });
  }

  async tradingOrder(input: BitnobTradingOrderInput): Promise<any> {
    return this.request('post', '/api/trading/orders', {
      base_currency: input.baseCurrency,
      quote_currency: input.quoteCurrency,
      side: input.side,
      quantity: input.quantity,
      price: input.price,
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
