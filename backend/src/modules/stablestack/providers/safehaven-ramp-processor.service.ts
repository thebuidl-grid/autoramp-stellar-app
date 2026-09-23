import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import * as jwt from 'jsonwebtoken';
import { RampProcessor, RampProcessorTransaction } from '../ramp-processor.interface';

// Docs (https://safehavenmfb.readme.io/reference/introduction) list the
// sandbox host inconsistently once ("api.sanbox...", likely a typo) against
// every other page ("api.sandbox..."). Going with the consistently-repeated
// spelling; verify against the Postman collection if auth calls 404.
const SAFEHAVEN_SANDBOX_BASE_URL = 'https://api.sandbox.safehavenmfb.com';
const SAFEHAVEN_PRODUCTION_BASE_URL = 'https://api.safehavenmfb.com';

/**
 * SafeHaven MFB implementation of RampProcessor — AutoRamp's primary bank
 * rail as a signed partner (a licensed institution, not just a payments
 * aggregator, which is why it's the default over Flint/Paystack).
 *
 * Two structural differences from Flint/Paystack worth knowing:
 *
 * 1. Auth is OAuth2 client-credentials, but the "client secret" is a
 *    self-signed RS256 JWT ("client assertion") rather than a static
 *    secret — see https://safehavenmfb.readme.io/reference/signing-your-client-assertion.
 *    Every request also needs a `ClientID` header carrying the
 *    `ibs_client_id` returned by the token exchange (NOT the OAuth Client
 *    ID used to sign the assertion — SafeHaven's own docs warn these are
 *    easy to confuse).
 *
 * 2. Onramp virtual accounts ARE per-transaction (like Flint, unlike
 *    Paystack's persistent per-customer DVA) — `POST /virtual-accounts`
 *    takes an `externalReference` we set to our own transaction reference
 *    and a fixed `amount`/`validFor` window. But offramp (`POST
 *    /transfers`) has no per-request callback field at all — payout
 *    notifications only arrive at whatever URL is registered once in the
 *    SafeHaven dashboard (Settings -> Notification Settings -> Webhook),
 *    not per transaction.
 *
 * CRITICAL GAP: as of writing, SafeHaven's webhook docs
 * (https://safehavenmfb.readme.io/reference/webhooks,
 * .../setting-up-webhooks) document event types and payload shapes but
 * NOT a signature/HMAC verification scheme — no header name, no secret.
 * Because of that, `WebhookService.processSafeHavenWebhook` never trusts
 * the webhook body directly: it only pulls an identifier (sessionId /
 * paymentReference) from it and re-derives the actual status via
 * `verifyStatus` below, which calls SafeHaven's authenticated status
 * endpoints ourselves. The webhook is a low-latency trigger, not a source
 * of truth. Ask SafeHaven support about IP allowlisting or a signing
 * secret and tighten this once available.
 *
 * NOTE: built against SafeHaven's published docs; not yet exercised
 * against their live sandbox. Verify field names/response shapes against
 * a real sandbox call before trusting this in production — same caveat
 * already applied to Flint and Paystack in this codebase.
 */
@Injectable()
export class SafeHavenRampProcessor implements RampProcessor {
  private readonly logger = new Logger(SafeHavenRampProcessor.name);
  private readonly baseUrl: string;
  private readonly clientId: string;
  private readonly privateKey: string;
  private readonly companyUrl: string;
  private readonly debitAccountNumber?: string;
  private readonly settlementBankCode: string;
  private readonly settlementAccountNumber?: string;
  private readonly validForSeconds: number;
  private readonly webhookSharedSecret?: string;

  private tokenCache: { accessToken: string; ibsClientId: string; expiresAt: number } | null = null;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl =
      this.configService.get<string>('SAFEHAVEN_BASE_URL') ||
      (this.configService.get<string>('STELLAR_NETWORK') === 'mainnet'
        ? SAFEHAVEN_PRODUCTION_BASE_URL
        : SAFEHAVEN_SANDBOX_BASE_URL);
    this.clientId = this.configService.get<string>('SAFEHAVEN_CLIENT_ID') || '';
    const rawKey = this.configService.get<string>('SAFEHAVEN_CLIENT_ASSERTION_PRIVATE_KEY') || '';
    // .env files can't hold real newlines cleanly — accept the common
    // convention of literal "\n" escapes and unescape them.
    this.privateKey = rawKey.replace(/\\n/g, '\n');
    this.companyUrl = this.configService.get<string>('SAFEHAVEN_COMPANY_URL') || '';

    if (!this.clientId || !this.privateKey || !this.companyUrl) {
      throw new HttpException(
        'SAFEHAVEN_CLIENT_ID, SAFEHAVEN_CLIENT_ASSERTION_PRIVATE_KEY, or SAFEHAVEN_COMPANY_URL missing in config',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    this.debitAccountNumber = this.configService.get<string>('SAFEHAVEN_DEBIT_ACCOUNT_NUMBER') || undefined;
    this.settlementBankCode = this.configService.get<string>('SAFEHAVEN_SETTLEMENT_BANK_CODE') || '090286';
    this.settlementAccountNumber =
      this.configService.get<string>('SAFEHAVEN_SETTLEMENT_ACCOUNT_NUMBER') || undefined;
    this.validForSeconds = Number(
      this.configService.get<string>('SAFEHAVEN_VIRTUAL_ACCOUNT_VALID_FOR_SECONDS') || 1800,
    );
    this.webhookSharedSecret = this.configService.get<string>('SAFEHAVEN_WEBHOOK_SHARED_SECRET') || undefined;
  }

  async getBanks(): Promise<any> {
    try {
      const headers = await this.authHeaders();
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/transfers/banks`, { headers }),
      );
      return response.data;
    } catch (error) {
      this.handleError('Failed to fetch banks', error);
    }
  }

  async resolveAccount(bankCode: string, accountNumber: string): Promise<any> {
    try {
      const headers = await this.authHeaders();
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/transfers/name-enquiry`,
          { bankCode, accountNumber },
          { headers },
        ),
      );
      return response.data;
    } catch (error) {
      this.handleError('Failed to resolve account', error);
    }
  }

  async initiateOnramp(params: {
    reference: string;
    amount: number;
    destinationAddress: string;
    notifyUrl?: string;
    userEmail?: string; // unused — SafeHaven's virtual accounts are per-transaction, not per-customer
  }): Promise<RampProcessorTransaction> {
    if (!params.notifyUrl) {
      throw new HttpException(
        'A notifyUrl (callbackUrl) is required to create a SafeHaven virtual account',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!this.settlementAccountNumber) {
      throw new HttpException(
        'SAFEHAVEN_SETTLEMENT_ACCOUNT_NUMBER missing in config',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    try {
      const headers = await this.authHeaders();
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/virtual-accounts`,
          {
            callbackUrl: this.withWebhookSecret(params.notifyUrl),
            amountControl: 'Fixed',
            amount: params.amount,
            validFor: this.validForSeconds,
            settlementAccount: {
              bankCode: this.settlementBankCode,
              accountNumber: this.settlementAccountNumber,
            },
            externalReference: params.reference,
          },
          { headers },
        ),
      );

      const data = response.data?.data;
      return {
        providerTransactionId: data?._id || null,
        depositAccount: data
          ? { accountNumber: data.accountNumber, accountName: data.accountName }
          : null,
        raw: response.data,
      };
    } catch (error) {
      this.handleError('Failed to initialise onramp (SafeHaven virtual account)', error);
    }
  }

  async executeOfframpPayout(params: {
    reference: string;
    amount: number;
    bankCode: string;
    accountNumber: string;
    notifyUrl?: string; // unused — SafeHaven has no per-transfer callback field; payout
    // notifications only arrive at the single URL registered in the dashboard.
  }): Promise<RampProcessorTransaction> {
    if (!this.debitAccountNumber) {
      throw new HttpException(
        'SAFEHAVEN_DEBIT_ACCOUNT_NUMBER missing in config',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    try {
      const headers = await this.authHeaders();

      // Prerequisite per SafeHaven's docs: a transfer must reference a
      // recent name-enquiry sessionId for the beneficiary.
      const nameEnquiry = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/transfers/name-enquiry`,
          { bankCode: params.bankCode, accountNumber: params.accountNumber },
          { headers },
        ),
      );
      const sessionId = nameEnquiry.data?.data?.sessionId;
      if (!sessionId) {
        throw new Error('SafeHaven name-enquiry did not return a sessionId');
      }

      const transferRes = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/transfers`,
          {
            nameEnquiryReference: sessionId,
            debitAccountNumber: this.debitAccountNumber,
            beneficiaryBankCode: params.bankCode,
            beneficiaryAccountNumber: params.accountNumber,
            amount: params.amount,
            saveBeneficiary: false,
            narration: 'AutoRamp offramp',
            paymentReference: params.reference,
          },
          { headers },
        ),
      );

      const data = transferRes.data?.data;
      return {
        providerTransactionId: data?._id || null,
        depositAccount: data?.creditAccountName ? { accountName: data.creditAccountName } : null,
        raw: transferRes.data,
      };
    } catch (error) {
      this.handleError('Failed to initialise offramp (SafeHaven transfer)', error);
    }
  }

  /**
   * Re-derives status from SafeHaven's own authenticated status endpoints,
   * trying the offramp path (transfer status) first and falling back to
   * the onramp path (virtual account transfer status) — see the class
   * doc comment for why the webhook body itself is never trusted.
   */
  async verifyStatus(params: { sessionId?: string; paymentReference?: string }): Promise<{
    kind: 'onramp' | 'offramp';
    reference: string | null;
    completed: boolean;
    failed: boolean;
    raw: any;
  } | null> {
    if (!params.sessionId && !params.paymentReference) {
      return null;
    }

    const transferStatus = await this.getTransferStatus(params);
    if (transferStatus?.data) {
      const d = transferStatus.data;
      const status = String(d.status || '').toLowerCase();
      return {
        kind: 'offramp',
        reference: d.paymentReference || params.paymentReference || null,
        completed: status === 'completed',
        failed: ['failed', 'declined', 'reversed'].includes(status),
        raw: transferStatus,
      };
    }

    if (params.sessionId) {
      const vaStatus = await this.getVirtualAccountTransferStatus(params.sessionId);
      if (vaStatus?.data) {
        const d = vaStatus.data;
        const status = String(d.status || '').toLowerCase();
        return {
          kind: 'onramp',
          reference: d.externalReference || d.paymentReference || null,
          completed: status === 'completed' || status === 'approved',
          failed: ['failed', 'declined'].includes(status),
          raw: vaStatus,
        };
      }
    }

    return null;
  }

  /** Appends our own shared-secret query param to a callback URL, if configured. */
  private withWebhookSecret(url: string): string {
    if (!this.webhookSharedSecret) return url;
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}key=${encodeURIComponent(this.webhookSharedSecret)}`;
  }

  private async getTransferStatus(params: { sessionId?: string; paymentReference?: string }): Promise<any> {
    try {
      const headers = await this.authHeaders();
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/transfers/status`,
          { sessionId: params.sessionId, paymentReference: params.paymentReference },
          { headers },
        ),
      );
      return response.data;
    } catch (error) {
      if (error instanceof AxiosError && error.response?.status === 400) return null; // "Unable to locate record" — not our transfer
      throw error;
    }
  }

  private async getVirtualAccountTransferStatus(sessionId: string): Promise<any> {
    try {
      const headers = await this.authHeaders();
      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/virtual-accounts/status`, { sessionId }, { headers }),
      );
      return response.data;
    } catch (error) {
      if (error instanceof AxiosError && error.response?.status === 400) return null;
      throw error;
    }
  }

  /**
   * Client-credentials exchange using a self-signed RS256 "client
   * assertion" JWT (SafeHaven's own take on OAuth2 client auth — see
   * https://safehavenmfb.readme.io/reference/signing-your-client-assertion).
   * Cached in-memory until near expiry; re-signs and re-exchanges rather
   * than using the refresh_token grant, to stay stateless per-instance.
   */
  private async authHeaders(): Promise<Record<string, string>> {
    const now = Date.now();
    if (this.tokenCache && this.tokenCache.expiresAt > now) {
      return {
        Authorization: `Bearer ${this.tokenCache.accessToken}`,
        ClientID: this.tokenCache.ibsClientId,
        'Content-Type': 'application/json',
      };
    }

    const clientAssertion = jwt.sign(
      { iss: this.companyUrl, sub: this.clientId, aud: this.baseUrl },
      this.privateKey,
      { algorithm: 'RS256', expiresIn: '5m' },
    );

    const response = await firstValueFrom(
      this.httpService.post(`${this.baseUrl}/oauth2/token`, {
        grant_type: 'client_credentials',
        client_id: this.clientId,
        client_assertion: clientAssertion,
        client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      }),
    );

    const { access_token: accessToken, ibs_client_id: ibsClientId, expires_in: expiresIn } = response.data || {};
    if (!accessToken || !ibsClientId) {
      throw new Error('SafeHaven token exchange did not return access_token/ibs_client_id');
    }

    // 60s safety buffer before actual expiry.
    this.tokenCache = { accessToken, ibsClientId, expiresAt: now + (Number(expiresIn || 0) - 60) * 1000 };

    return { Authorization: `Bearer ${accessToken}`, ClientID: ibsClientId, 'Content-Type': 'application/json' };
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
