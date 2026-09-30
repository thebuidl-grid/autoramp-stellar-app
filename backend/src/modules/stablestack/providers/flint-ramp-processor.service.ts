import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import { RampProcessor, RampProcessorTransaction } from '../ramp-processor.interface';

/**
 * Flint implementation of RampProcessor.
 *
 * NOTE: Flint's API historically bundled NGN bank-rail collection *and*
 * EVM crypto settlement together. Flint has no Stellar support, so this is
 * used in bank-rail-only mode (collect/pay out NGN, notify us via
 * webhook) — the actual mint/detect-deposit happens via StellarService,
 * driven by StablestackService/WebhookService. Confirm this request/
 * response contract against Flint's docs before relying on it in
 * production.
 */
@Injectable()
export class FlintRampProcessor implements RampProcessor {
  private readonly apiUrl?: string;
  private readonly apiKey?: string;
  private readonly commonHeaders = {
    Accept: 'application/json',
    'x-api-key': '',
  };

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.apiUrl = this.configService.get<string>('STABLESTACK_API_URL');
    this.apiKey = this.configService.get<string>('STABLESTACK_API_KEY');

    if (!this.apiUrl || !this.apiKey) {
      throw new HttpException(
        'STABLESTACK_API_URL or STABLESTACK_API_KEY missing in config',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    this.commonHeaders['x-api-key'] = this.apiKey;
  }

  async getBanks(): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.apiUrl}/v1/ramp/banks`, {
          headers: this.commonHeaders,
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
        this.httpService.get(`${this.apiUrl}/v1/ramp/banks/nameQuery`, {
          headers: this.commonHeaders,
          params: { bankCode, accountNumber },
        }),
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
    userEmail?: string; // unused — Flint's model doesn't need it
  }): Promise<RampProcessorTransaction> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.apiUrl}/v1/ramp/initialise`,
          {
            type: 'on',
            network: 'stellar',
            reference: params.reference,
            amount: params.amount,
            destination: { address: params.destinationAddress },
            notifyUrl: params.notifyUrl || undefined,
          },
          { headers: { ...this.commonHeaders, 'Content-Type': 'application/json' } },
        ),
      );

      const flintData = response.data;
      return {
        providerTransactionId: flintData?.data?.transactionId || null,
        depositAccount: flintData?.data?.depositAccount || null,
        raw: flintData,
      };
    } catch (error) {
      this.handleError('Failed to initialise onramp', error);
    }
  }

  async executeOfframpPayout(params: {
    reference: string;
    amount: number;
    bankCode: string;
    accountNumber: string;
    notifyUrl?: string;
  }): Promise<RampProcessorTransaction> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.apiUrl}/v1/ramp/initialise`,
          {
            type: 'off',
            network: 'stellar',
            reference: params.reference,
            amount: params.amount,
            destination: { bankCode: params.bankCode, accountNumber: params.accountNumber },
            notifyUrl: params.notifyUrl || undefined,
          },
          { headers: { ...this.commonHeaders, 'Content-Type': 'application/json' } },
        ),
      );

      const flintData = response.data;
      return {
        providerTransactionId: flintData?.data?.transactionId || null,
        depositAccount: flintData?.data?.depositAccount || null,
        raw: flintData,
      };
    } catch (error) {
      this.handleError('Failed to initialise offramp', error);
    }
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
