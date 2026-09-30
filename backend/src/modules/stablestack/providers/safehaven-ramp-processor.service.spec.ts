import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { HttpException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { AxiosError } from 'axios';
import * as crypto from 'crypto';
import { SafeHavenRampProcessor } from './safehaven-ramp-processor.service';

const { privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

describe('SafeHavenRampProcessor', () => {
  let processor: SafeHavenRampProcessor;
  let httpService: { get: jest.Mock; post: jest.Mock };

  const tokenResponse = {
    data: {
      access_token: 'access-token-1',
      ibs_client_id: 'ibs-client-1',
      expires_in: 2399,
      token_type: 'Bearer',
    },
  };

  async function build(configOverrides: Record<string, string | undefined> = {}) {
    httpService = { get: jest.fn(), post: jest.fn() };
    const config: Record<string, string | undefined> = {
      SAFEHAVEN_CLIENT_ID: 'oauth-client-1',
      SAFEHAVEN_CLIENT_ASSERTION_PRIVATE_KEY: privateKey,
      SAFEHAVEN_COMPANY_URL: 'https://autoramp.example.com',
      SAFEHAVEN_DEBIT_ACCOUNT_NUMBER: '0011122233',
      SAFEHAVEN_SETTLEMENT_ACCOUNT_NUMBER: '0099988877',
      ...configOverrides,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SafeHavenRampProcessor,
        { provide: HttpService, useValue: httpService },
        { provide: ConfigService, useValue: { get: jest.fn((key: string) => config[key]) } },
      ],
    }).compile();

    return module.get<SafeHavenRampProcessor>(SafeHavenRampProcessor);
  }

  beforeEach(async () => {
    processor = await build();
  });

  it('throws at construction if required auth config is missing', async () => {
    await expect(build({ SAFEHAVEN_CLIENT_ID: undefined })).rejects.toThrow(
      'SAFEHAVEN_CLIENT_ID',
    );
  });

  describe('getBanks / resolveAccount', () => {
    it('exchanges a client assertion for a token, then fetches banks with the ClientID header', async () => {
      httpService.post.mockReturnValueOnce(of(tokenResponse));
      httpService.get.mockReturnValueOnce(
        of({ data: { statusCode: 200, data: [{ name: 'STERLING BANK', bankCode: '000001' }] } }),
      );

      const result = await processor.getBanks();

      expect(result.data[0].name).toBe('STERLING BANK');
      expect(httpService.get).toHaveBeenCalledWith(
        expect.stringContaining('/transfers/banks'),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer access-token-1', ClientID: 'ibs-client-1' }),
        }),
      );
    });

    it('resolves an account via name-enquiry', async () => {
      httpService.post.mockReturnValueOnce(of(tokenResponse));
      httpService.post.mockReturnValueOnce(
        of({ data: { data: { sessionId: 'sess-1', accountName: 'JOHN DOE' } } }),
      );

      const result = await processor.resolveAccount('000001', '1234567890');

      expect(result.data.accountName).toBe('JOHN DOE');
    });

    it('caches the access token across calls (only one token exchange)', async () => {
      httpService.post.mockReturnValueOnce(of(tokenResponse));
      httpService.get.mockReturnValue(of({ data: { data: [] } }));

      await processor.getBanks();
      await processor.getBanks();

      const tokenCalls = httpService.post.mock.calls.filter(([url]) => url.includes('/oauth2/token'));
      expect(tokenCalls).toHaveLength(1);
    });
  });

  describe('initiateOnramp', () => {
    it('requires a notifyUrl', async () => {
      await expect(
        processor.initiateOnramp({ reference: 'txn_ref_1', amount: 10000, destinationAddress: 'GDEST' }),
      ).rejects.toThrow('notifyUrl');
    });

    it('requires SAFEHAVEN_SETTLEMENT_ACCOUNT_NUMBER', async () => {
      const noSettlement = await build({ SAFEHAVEN_SETTLEMENT_ACCOUNT_NUMBER: undefined });
      await expect(
        noSettlement.initiateOnramp({
          reference: 'txn_ref_1',
          amount: 10000,
          destinationAddress: 'GDEST',
          notifyUrl: 'https://autoramp.example.com/webhook/safehaven',
        }),
      ).rejects.toThrow('SAFEHAVEN_SETTLEMENT_ACCOUNT_NUMBER');
    });

    it('creates a per-transaction virtual account with our reference as externalReference', async () => {
      httpService.post.mockReturnValueOnce(of(tokenResponse));
      httpService.post.mockReturnValueOnce(
        of({
          data: {
            statusCode: 200,
            data: { _id: 'va-1', accountNumber: '6020017561', accountName: 'AutoRamp Checkout' },
          },
        }),
      );

      const result = await processor.initiateOnramp({
        reference: 'txn_ref_1',
        amount: 10000,
        destinationAddress: 'GDEST',
        notifyUrl: 'https://autoramp.example.com/webhook/safehaven',
      });

      expect(result.providerTransactionId).toBe('va-1');
      expect(result.depositAccount).toEqual({ accountNumber: '6020017561', accountName: 'AutoRamp Checkout' });

      const [, body] = httpService.post.mock.calls[1];
      expect(body).toEqual(
        expect.objectContaining({
          externalReference: 'txn_ref_1',
          amount: 10000,
          amountControl: 'Fixed',
          callbackUrl: 'https://autoramp.example.com/webhook/safehaven',
        }),
      );
    });

    it('appends the webhook shared secret to the callback URL when configured', async () => {
      const withSecret = await build({ SAFEHAVEN_WEBHOOK_SHARED_SECRET: 's3cret' });
      httpService.post.mockReturnValueOnce(of(tokenResponse));
      httpService.post.mockReturnValueOnce(
        of({ data: { data: { _id: 'va-2', accountNumber: '123', accountName: 'x' } } }),
      );

      await withSecret.initiateOnramp({
        reference: 'txn_ref_2',
        amount: 5000,
        destinationAddress: 'GDEST',
        notifyUrl: 'https://autoramp.example.com/webhook/safehaven',
      });

      const [, body] = httpService.post.mock.calls[1];
      expect(body.callbackUrl).toBe('https://autoramp.example.com/webhook/safehaven?key=s3cret');
    });
  });

  describe('executeOfframpPayout', () => {
    it('requires SAFEHAVEN_DEBIT_ACCOUNT_NUMBER', async () => {
      const noDebit = await build({ SAFEHAVEN_DEBIT_ACCOUNT_NUMBER: undefined });
      await expect(
        noDebit.executeOfframpPayout({ reference: 'txn_ref_3', amount: 5000, bankCode: '058', accountNumber: '1234567890' }),
      ).rejects.toThrow('SAFEHAVEN_DEBIT_ACCOUNT_NUMBER');
    });

    it('runs a name-enquiry then a transfer using its sessionId', async () => {
      httpService.post.mockReturnValueOnce(of(tokenResponse));
      httpService.post.mockReturnValueOnce(of({ data: { data: { sessionId: 'sess-off-1' } } }));
      httpService.post.mockReturnValueOnce(
        of({ data: { data: { _id: 'trf-1', creditAccountName: 'JOHN DOE' } } }),
      );

      const result = await processor.executeOfframpPayout({
        reference: 'txn_ref_3',
        amount: 5000,
        bankCode: '058',
        accountNumber: '1234567890',
      });

      expect(result.providerTransactionId).toBe('trf-1');
      const [, transferBody] = httpService.post.mock.calls[2];
      expect(transferBody).toEqual(
        expect.objectContaining({
          nameEnquiryReference: 'sess-off-1',
          debitAccountNumber: '0011122233',
          paymentReference: 'txn_ref_3',
          amount: 5000,
        }),
      );
    });

    it('maps HTTP errors to an HttpException', async () => {
      httpService.post.mockReturnValueOnce(of(tokenResponse));
      const axiosError = new AxiosError('Bad Request');
      (axiosError as any).response = { status: 400, data: { message: 'invalid account' } };
      httpService.post.mockReturnValueOnce(throwError(() => axiosError));

      await expect(
        processor.executeOfframpPayout({ reference: 'txn_ref_4', amount: 1000, bankCode: '058', accountNumber: 'x' }),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('verifyStatus', () => {
    it('returns null when neither sessionId nor paymentReference is given', async () => {
      const result = await processor.verifyStatus({});
      expect(result).toBeNull();
      expect(httpService.post).not.toHaveBeenCalled();
    });

    it('matches an offramp via transfers/status', async () => {
      httpService.post.mockReturnValueOnce(of(tokenResponse));
      httpService.post.mockReturnValueOnce(
        of({ data: { data: { status: 'Completed', paymentReference: 'txn_ref_off' } } }),
      );

      const result = await processor.verifyStatus({ paymentReference: 'txn_ref_off' });

      expect(result).toEqual(
        expect.objectContaining({ kind: 'offramp', reference: 'txn_ref_off', completed: true, failed: false }),
      );
    });

    it('falls back to virtual-accounts/status for an onramp when transfers/status 400s', async () => {
      httpService.post.mockReturnValueOnce(of(tokenResponse));
      const notFound = new AxiosError('Bad Request');
      (notFound as any).response = { status: 400, data: { message: 'Unable to locate record' } };
      httpService.post.mockReturnValueOnce(throwError(() => notFound));
      httpService.post.mockReturnValueOnce(
        of({ data: { data: { status: 'Completed', externalReference: 'txn_ref_on' } } }),
      );

      const result = await processor.verifyStatus({ sessionId: 'sess-1' });

      expect(result).toEqual(
        expect.objectContaining({ kind: 'onramp', reference: 'txn_ref_on', completed: true, failed: false }),
      );
    });

    it('returns null when both lookups come back not-found', async () => {
      httpService.post.mockReturnValueOnce(of(tokenResponse));
      const notFound1 = new AxiosError('Bad Request');
      (notFound1 as any).response = { status: 400 };
      httpService.post.mockReturnValueOnce(throwError(() => notFound1));
      const notFound2 = new AxiosError('Bad Request');
      (notFound2 as any).response = { status: 400 };
      httpService.post.mockReturnValueOnce(throwError(() => notFound2));

      const result = await processor.verifyStatus({ sessionId: 'sess-unknown' });

      expect(result).toBeNull();
    });
  });
});
