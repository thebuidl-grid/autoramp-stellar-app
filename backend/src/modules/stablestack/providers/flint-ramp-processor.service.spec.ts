import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { HttpException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { AxiosError } from 'axios';
import { FlintRampProcessor } from './flint-ramp-processor.service';

describe('FlintRampProcessor', () => {
  let processor: FlintRampProcessor;
  let httpService: { get: jest.Mock; post: jest.Mock };

  beforeEach(async () => {
    httpService = { get: jest.fn(), post: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FlintRampProcessor,
        { provide: HttpService, useValue: httpService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) =>
              key === 'STABLESTACK_API_URL'
                ? 'https://flint.example.com'
                : key === 'STABLESTACK_API_KEY'
                  ? 'flint-key'
                  : undefined,
            ),
          },
        },
      ],
    }).compile();

    processor = module.get<FlintRampProcessor>(FlintRampProcessor);
  });

  it('throws at construction if Flint config is missing', async () => {
    await expect(
      Test.createTestingModule({
        providers: [
          FlintRampProcessor,
          { provide: HttpService, useValue: httpService },
          { provide: ConfigService, useValue: { get: jest.fn(() => undefined) } },
        ],
      }).compile(),
    ).rejects.toThrow('STABLESTACK_API_URL or STABLESTACK_API_KEY missing');
  });

  describe('initiateOnramp', () => {
    it('normalizes Flint\'s response into providerTransactionId/depositAccount/raw', async () => {
      httpService.post.mockReturnValue(
        of({
          data: {
            status: 'success',
            data: { transactionId: 'flint-tx-1', depositAccount: { bankName: 'Providus' } },
          },
        }),
      );

      const result = await processor.initiateOnramp({
        reference: 'txn_ref_1',
        amount: 10000,
        destinationAddress: 'GDEST',
      });

      expect(result.providerTransactionId).toBe('flint-tx-1');
      expect(result.depositAccount).toEqual({ bankName: 'Providus' });
      expect(result.raw.status).toBe('success');

      const [url, body] = httpService.post.mock.calls[0];
      expect(url).toBe('https://flint.example.com/v1/ramp/initialise');
      expect(body).toEqual(
        expect.objectContaining({ type: 'on', network: 'stellar', reference: 'txn_ref_1' }),
      );
    });

    it('maps Flint HTTP errors to an HttpException with the provider message', async () => {
      const axiosError = new AxiosError('Bad Request');
      (axiosError as any).response = { status: 422, data: { message: 'invalid destination' } };
      httpService.post.mockReturnValue(throwError(() => axiosError));

      await expect(
        processor.initiateOnramp({ reference: 'txn_ref_2', amount: 10000, destinationAddress: 'GDEST' }),
      ).rejects.toMatchObject({
        constructor: HttpException,
        message: expect.stringContaining('invalid destination'),
      });
    });
  });

  describe('executeOfframpPayout', () => {
    it('normalizes the response the same way as onramp', async () => {
      httpService.post.mockReturnValue(
        of({ data: { status: 'success', data: { transactionId: 'flint-tx-3' } } }),
      );

      const result = await processor.executeOfframpPayout({
        reference: 'txn_ref_3',
        amount: 5000,
        bankCode: '058',
        accountNumber: '1234567890',
      });

      expect(result.providerTransactionId).toBe('flint-tx-3');
      const [, body] = httpService.post.mock.calls[0];
      expect(body).toEqual(expect.objectContaining({ type: 'off', network: 'stellar' }));
    });
  });

  describe('getBanks / resolveAccount', () => {
    it('passes through Flint\'s raw response', async () => {
      httpService.get.mockReturnValue(of({ data: { status: 'success', data: [{ institutionCode: '058' }] } }));
      const result = await processor.getBanks();
      expect(result.data[0].institutionCode).toBe('058');
    });
  });
});
