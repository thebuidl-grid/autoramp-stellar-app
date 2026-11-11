import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';

@Injectable()
export class PulseMfbService {
  private readonly logger = new Logger(PulseMfbService.name);
  private readonly baseUrl: string;
  private readonly publicKey: string;
  private readonly privateKey: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.baseUrl =
      this.configService.get<string>('PULSE_MFB_BASE_URL') ||
      process.env.PULSE_MFB_BASE_URL ||
      '';
    this.publicKey =
      this.configService.get<string>('PULSE_MFB_PUBLIC_KEY') ||
      process.env.PULSE_MFB_PUBLIC_KEY ||
      '';
    this.privateKey =
      this.configService.get<string>('PULSE_MFB_PRIVATE_KEY') ||
      process.env.PULSE_MFB_PRIVATE_KEY ||
      '';
    this.logger.log(
      `PulseMfb initialized: baseUrl=${this.baseUrl}, publicKey=${this.publicKey ? 'SET' : 'MISSING'}, privateKey=${this.privateKey ? 'SET' : 'MISSING'}`,
    );
  }

  private generateSignature(
    timestamp: string,
    method: string,
    path: string,
    body: any,
  ): string {
    const bodyString = body ? JSON.stringify(body) : '';
    const payload = timestamp + method.toUpperCase() + path + bodyString;

    return crypto
      .createHmac('sha256', this.privateKey)
      .update(payload)
      .digest('hex');
  }

  private async makeRequest<T>(
    method: string,
    path: string,
    data?: any,
  ): Promise<T> {
    const timestamp = Date.now().toString();
    const signature = this.generateSignature(timestamp, method, path, data);

    const config: any = {
      method,
      url: `${this.baseUrl}${path}`,
      headers: {
        'Content-Type': 'application/json',
        'x-public-key': this.publicKey,
        'x-signature': signature,
        'x-timestamp': timestamp,
      },
    };

    if (data) {
      config.data = data;
    }

    try {
      const response = await firstValueFrom(this.httpService.request(config));
      return response.data;
    } catch (error) {
      const upstream = error.response?.data || error.message;
      this.logger.error(
        `Pulse MFB request failed [${method} ${path}]: ${JSON.stringify(upstream)}`,
      );
      throw new HttpException(
        upstream?.message || `Pulse MFB ${method} ${path} failed`,
        error.response?.status || HttpStatus.BAD_GATEWAY,
      );
    }
  }

  /**
   * Create a prefix account.
   */
  async createAccount(data: {
    customerName: string;
    customerPhone: string;
    customerEmail: string;
    reference: string;
    bvn?: string;
  }) {
    const payload = {
      customer_name: data.customerName,
      customer_phone: data.customerPhone,
      customer_email: data.customerEmail,
      reference: data.reference,
      ...(data.bvn ? { bvn: data.bvn } : {}),
    };
    this.logger.log(
      `[PulseMfb] createAccount → POST /api/v1/external-api/accounts/prefix`,
    );
    this.logger.log(
      `[PulseMfb] createAccount payload=${JSON.stringify(payload)}`,
    );
    return this.makeRequest(
      'POST',
      '/api/v1/external-api/accounts/prefix',
      payload,
    );
  }

  /**
   * Initiate a transfer.
   */
  async initiateTransfer(data: {
    debitAccountNumber: string;
    beneficiaryAccountNumber: string;
    beneficiaryBankCode: string;
    amount: number;
    narration: string;
    reference: string;
  }) {
    return this.makeRequest('POST', '/api/v1/external-api/transfers', {
      debit_account_number: data.debitAccountNumber,
      beneficiary_account_number: data.beneficiaryAccountNumber,
      beneficiary_bank_code: data.beneficiaryBankCode,
      amount: data.amount,
      narration: data.narration,
      reference: data.reference,
    });
  }

  /**
   * Get account balance.
   */
  async getBalance(accountNumber: string) {
    return this.makeRequest(
      'GET',
      `/api/v1/external-api/accounts/${accountNumber}/balance`,
    );
  }

  /**
   * Perform name enquiry for a bank account.
   */
  async nameEnquiry(bankCode: string, accountNumber: string) {
    return this.makeRequest(
      'POST',
      '/api/v1/external-api/transfers/name-enquiry',
      {
        accountNumber,
        bankCode,
      },
    );
  }

  /**
   * Get transfer history.
   */
  async getTransfers(params: {
    accountNumber?: string;
    page?: number;
    limit?: number;
    status?: string;
    fromDate?: string;
    toDate?: string;
  }) {
    const queryParams = new URLSearchParams();
    if (params.accountNumber)
      queryParams.set('account_number', params.accountNumber);
    if (params.page) queryParams.set('page', params.page.toString());
    if (params.limit) queryParams.set('limit', params.limit.toString());
    if (params.status) queryParams.set('status', params.status);
    if (params.fromDate) queryParams.set('from_date', params.fromDate);
    if (params.toDate) queryParams.set('to_date', params.toDate);

    const query = queryParams.toString();
    return this.makeRequest(
      'GET',
      `/api/v1/external-api/transfers${query ? `?${query}` : ''}`,
    );
  }

  /**
   * Get a single transfer by reference.
   */
  async getTransfer(reference: string) {
    return this.makeRequest(
      'GET',
      `/api/v1/external-api/transfers/${reference}`,
    );
  }

  /**
   * Get webhook configuration.
   */
  async getWebhookConfig() {
    return this.makeRequest('GET', '/api/v1/external-api/webhooks');
  }

  /**
   * Update webhook configuration.
   */
  async updateWebhookConfig(data: { webhookUrl?: string; events?: string[] }) {
    const payload: Record<string, unknown> = {};
    if (data.webhookUrl) payload.webhook_url = data.webhookUrl;
    if (data.events) payload.events = data.events;
    return this.makeRequest('PATCH', '/api/v1/external-api/webhooks', payload);
  }

  /**
   * Send test webhook.
   */
  async testWebhook() {
    return this.makeRequest('POST', '/api/v1/external-api/webhooks/test');
  }
}
