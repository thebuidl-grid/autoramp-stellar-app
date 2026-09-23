import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { HttpException, BadRequestException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { AxiosError } from 'axios';
import { PaystackRampProcessor } from './paystack-ramp-processor.service';

describe('PaystackRampProcessor', () => {
  let processor: PaystackRampProcessor;
  let httpService: { get: jest.Mock; post: jest.Mock };

  async function build(configOverrides: Record<string, string | undefined> = {}) {
    httpService = { get: jest.fn(), post: jest.fn() };
    const config: Record<string, string | undefined> = {
      PAYSTACK_SECRET_KEY: 'sk_test_123',
      PAYSTACK_DVA_PREFERRED_BANK: 'test-bank',
      ...configOverrides,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaystackRampProcessor,
        { provide: HttpService, useValue: httpService },
        { provide: ConfigService, useValue: { get: jest.fn((key: string) => config[key]) } },
      ],
    }).compile();

    return module.get<PaystackRampProcessor>(PaystackRampProcessor);
  }

  beforeEach(async () => {
    processor = await build();
  });

  it('throws at construction if PAYSTACK_SECRET_KEY is missing', async () => {
    await expect(build({ PAYSTACK_SECRET_KEY: undefined })).rejects.toThrow(
      'PAYSTACK_SECRET_KEY missing',
    );
  });

  describe('getBanks / resolveAccount', () => {
    it('passes through Paystack\'s raw response', async () => {
      httpService.get.mockReturnValue(of({ data: { status: true, data: [{ code: '058', name: 'GTBank' }] } }));
      const result = await processor.getBanks();
      expect(result.data[0].name).toBe('GTBank');
    });

    it('resolves an account via bank/resolve', async () => {
      httpService.get.mockReturnValue(of({ data: { status: true, data: { account_name: 'JOHN DOE' } } }));
      const result = await processor.resolveAccount('058', '1234567890');
      expect(result.data.account_name).toBe('JOHN DOE');
      expect(httpService.get).toHaveBeenCalledWith(
        expect.stringContaining('/bank/resolve'),
        expect.objectContaining({ params: { account_number: '1234567890', bank_code: '058' } }),
      );
    });

    it('fetches the Ghana bank list when currency=GHS is requested', async () => {
      httpService.get.mockReturnValue(of({ data: { status: true, data: [{ name: 'GCB Bank' }] } }));
      const result = await processor.getBanks({ currency: 'GHS' });
      expect(result.data[0].name).toBe('GCB Bank');
      expect(httpService.get).toHaveBeenCalledWith(
        expect.stringContaining('/bank'),
        expect.objectContaining({ params: { country: 'ghana', currency: 'GHS' } }),
      );
    });

    it('throws for a currency with no known country/recipient-type mapping', async () => {
      await expect(processor.getBanks({ currency: 'ZAR' })).rejects.toThrow(
        'no country/recipient-type mapping',
      );
    });

    it('fetches the Kenya bank/telco list when currency=KES is requested', async () => {
      httpService.get.mockReturnValue(of({ data: { status: true, data: [{ name: 'Safaricom' }] } }));
      const result = await processor.getBanks({ currency: 'KES' });
      expect(result.data[0].name).toBe('Safaricom');
      expect(httpService.get).toHaveBeenCalledWith(
        expect.stringContaining('/bank'),
        expect.objectContaining({ params: { country: 'kenya', currency: 'KES' } }),
      );
    });
  });

  describe('initiateOnramp', () => {
    it('requires a userEmail — Paystack\'s DVA model is customer-centric', async () => {
      await expect(
        processor.initiateOnramp({ reference: 'txn_ref_1', amount: 10000, destinationAddress: 'GDEST' }),
      ).rejects.toThrow('requires a user email');
    });

    it('creates a new customer + DVA for a first-time user', async () => {
      // GET /customer/:email -> 404 (no existing customer)
      httpService.get.mockReturnValueOnce(
        throwError(() => {
          const err = new AxiosError('Not found');
          (err as any).response = { status: 404, data: { message: 'not found' } };
          return err;
        }),
      );
      // POST /customer -> creates one
      httpService.post.mockReturnValueOnce(of({ data: { data: { customer_code: 'CUS_abc' } } }));
      // GET /customer/:code -> no dedicated_account yet
      httpService.get.mockReturnValueOnce(of({ data: { data: {} } }));
      // POST /dedicated_account -> creates the DVA
      httpService.post.mockReturnValueOnce(
        of({
          data: {
            data: {
              account_number: '9990001234',
              account_name: 'AutoRamp/John Doe',
              bank: { name: 'Test Bank' },
            },
          },
        }),
      );

      const result = await processor.initiateOnramp({
        reference: 'txn_ref_1',
        amount: 10000,
        destinationAddress: 'GDEST',
        userEmail: 'john@example.com',
      });

      expect(result.depositAccount).toEqual({
        bankName: 'Test Bank',
        accountNumber: '9990001234',
        accountName: 'AutoRamp/John Doe',
      });
      expect(result.providerTransactionId).toBeNull();
      expect(httpService.post).toHaveBeenCalledWith(
        expect.stringContaining('/dedicated_account'),
        expect.objectContaining({ customer: 'CUS_abc', preferred_bank: 'test-bank' }),
        expect.anything(),
      );
    });

    it('reuses an existing customer + DVA for a returning user', async () => {
      httpService.get.mockReturnValueOnce(of({ data: { data: { customer_code: 'CUS_existing' } } }));
      httpService.get.mockReturnValueOnce(
        of({
          data: {
            data: {
              dedicated_account: {
                account_number: '9990009999',
                account_name: 'AutoRamp/Jane Doe',
                bank: { name: 'Test Bank' },
                currency: 'NGN',
              },
            },
          },
        }),
      );

      const result = await processor.initiateOnramp({
        reference: 'txn_ref_2',
        amount: 5000,
        destinationAddress: 'GDEST',
        userEmail: 'jane@example.com',
      });

      expect(result.depositAccount?.accountNumber).toBe('9990009999');
      expect(httpService.post).not.toHaveBeenCalled(); // no new customer/DVA created
    });

    it('does not reuse an NGN DVA for a GHS request — creates a new one', async () => {
      const ghsProcessor = await build({ PAYSTACK_DVA_PREFERRED_BANK_GHS: 'ghs-test-bank' });
      httpService.get.mockReturnValueOnce(of({ data: { data: { customer_code: 'CUS_existing' } } }));
      httpService.get.mockReturnValueOnce(
        of({ data: { data: { dedicated_account: { account_number: '999', currency: 'NGN' } } } }),
      );
      httpService.post.mockReturnValueOnce(
        of({
          data: {
            data: { account_number: '5010001234', account_name: 'AutoRamp/Kwame', bank: { name: 'GCB' } },
          },
        }),
      );

      const result = await ghsProcessor.initiateOnramp({
        reference: 'txn_ref_ghs_1',
        amount: 500,
        destinationAddress: 'GDEST',
        userEmail: 'kwame@example.com',
        currency: 'GHS',
      });

      expect(result.depositAccount?.accountNumber).toBe('5010001234');
      const [, body] = httpService.post.mock.calls[0];
      expect(body).toEqual(
        expect.objectContaining({ currency: 'GHS', preferred_bank: 'ghs-test-bank' }),
      );
    });

    it('requires PAYSTACK_DVA_PREFERRED_BANK_GHS for a first-time GHS DVA', async () => {
      const ghsProcessor = await build();
      httpService.get.mockReturnValueOnce(
        throwError(() => {
          const err = new AxiosError('Not found');
          (err as any).response = { status: 404 };
          return err;
        }),
      );
      httpService.post.mockReturnValueOnce(of({ data: { data: { customer_code: 'CUS_new' } } }));
      httpService.get.mockReturnValueOnce(of({ data: { data: {} } }));

      await expect(
        ghsProcessor.initiateOnramp({
          reference: 'txn_ref_ghs_2',
          amount: 500,
          destinationAddress: 'GDEST',
          userEmail: 'ama@example.com',
          currency: 'GHS',
        }),
      ).rejects.toThrow('PAYSTACK_DVA_PREFERRED_BANK_GHS');
    });

    it('collects KES onramp via an M-Pesa charge, not a DVA', async () => {
      httpService.post.mockReturnValueOnce(
        of({
          data: {
            data: {
              status: 'pay_offline',
              display_text: 'Please enter your M-Pesa PIN to complete this transaction',
              reference: 'txn_ref_kes_1',
            },
          },
        }),
      );

      const result = await processor.initiateOnramp({
        reference: 'txn_ref_kes_1',
        amount: 1000,
        destinationAddress: 'GDEST',
        userEmail: 'wanjiru@example.com',
        phoneNumber: '+254712345678',
        currency: 'KES',
      });

      expect(result.collectionMethod).toBe('mobile_money_push');
      expect(result.depositAccount).toBeNull();
      expect(result.displayMessage).toContain('M-Pesa PIN');
      expect(httpService.get).not.toHaveBeenCalled(); // no DVA lookup at all
      expect(httpService.post).toHaveBeenCalledWith(
        expect.stringContaining('/charge'),
        expect.objectContaining({
          currency: 'KES',
          reference: 'txn_ref_kes_1',
          mobile_money: { phone: '+254712345678', provider: 'mpesa' },
        }),
        expect.anything(),
      );
    });

    it('requires a phoneNumber for a KES (M-Pesa) onramp', async () => {
      await expect(
        processor.initiateOnramp({
          reference: 'txn_ref_kes_2',
          amount: 1000,
          destinationAddress: 'GDEST',
          userEmail: 'wanjiru@example.com',
          currency: 'KES',
        }),
      ).rejects.toThrow('phoneNumber is required');
      expect(httpService.post).not.toHaveBeenCalled();
    });
  });

  describe('executeOfframpPayout', () => {
    it('creates a recipient then a transfer, converting NGN to kobo', async () => {
      httpService.post.mockReturnValueOnce(of({ data: { data: { recipient_code: 'RCP_123' } } }));
      httpService.post.mockReturnValueOnce(of({ data: { data: { transfer_code: 'TRF_456' } } }));

      const result = await processor.executeOfframpPayout({
        reference: 'txn_ref_3',
        amount: 5000,
        bankCode: '058',
        accountNumber: '1234567890',
      });

      expect(result.providerTransactionId).toBe('TRF_456');
      const [, transferBody] = httpService.post.mock.calls[1];
      expect(transferBody).toEqual(
        expect.objectContaining({ amount: 500000, recipient: 'RCP_123', source: 'balance' }),
      );
    });

    it('uses the ghipss recipient type and GHS currency for a Ghana offramp', async () => {
      httpService.post.mockReturnValueOnce(of({ data: { data: { recipient_code: 'RCP_gh_1' } } }));
      httpService.post.mockReturnValueOnce(of({ data: { data: { transfer_code: 'TRF_gh_1' } } }));

      await processor.executeOfframpPayout({
        reference: 'txn_ref_gh_1',
        amount: 200,
        bankCode: '030',
        accountNumber: '1234567890',
        currency: 'GHS',
      });

      const [, recipientBody] = httpService.post.mock.calls[0];
      expect(recipientBody).toEqual(expect.objectContaining({ type: 'ghipss', currency: 'GHS' }));
    });

    it('uses the mobile_money recipient type and KES currency for a Kenya offramp', async () => {
      httpService.post.mockReturnValueOnce(of({ data: { data: { recipient_code: 'RCP_ke_1' } } }));
      httpService.post.mockReturnValueOnce(of({ data: { data: { transfer_code: 'TRF_ke_1' } } }));

      await processor.executeOfframpPayout({
        reference: 'txn_ref_ke_1',
        amount: 300,
        bankCode: 'MPESA',
        accountNumber: '0712345678',
        currency: 'KES',
      });

      const [, recipientBody] = httpService.post.mock.calls[0];
      expect(recipientBody).toEqual(expect.objectContaining({ type: 'mobile_money', currency: 'KES' }));
    });

    it('maps Paystack HTTP errors to an HttpException', async () => {
      const axiosError = new AxiosError('Bad Request');
      (axiosError as any).response = { status: 400, data: { message: 'invalid account' } };
      httpService.post.mockReturnValue(throwError(() => axiosError));

      await expect(
        processor.executeOfframpPayout({ reference: 'txn_ref_4', amount: 1000, bankCode: '058', accountNumber: 'x' }),
      ).rejects.toThrow(HttpException);
    });
  });
});
