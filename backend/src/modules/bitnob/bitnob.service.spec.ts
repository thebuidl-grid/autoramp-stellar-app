import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';
import { AxiosError } from 'axios';
import { createHmac } from 'crypto';
import {
  BitNobService,
  buildBitnobAuthHeaders,
  deepPick,
  extractBitnobQuoteId,
  extractPayoutDeposit,
} from './bitnob.service';

describe('BitNobService mobile money destinations', () => {
  const make = () => {
    const svc = new BitNobService(
      { get: (k: string) => ({ BITNOB_CLIENT_ID: 'cid', BITNOB_KEY: 'secret' })[k] } as any,
      {} as any,
    );
    const request = jest.fn();
    (svc as any).request = request;
    return { svc, request };
  };

  describe('extractMobileMoneyNetworks', () => {
    it('reads a banks array on the mobile_money destination type', () => {
      const rows = BitNobService.extractMobileMoneyNetworks({
        destination_types: { mobile_money: { banks: [{ code: 'MPESA', name: 'M-Pesa' }] } },
      });
      expect(rows).toEqual([
        { code: 'MPESA', name: 'M-Pesa', bank_code: 'MPESA', destinationType: 'mobile_money' },
      ]);
    });

    it('falls back to the options of the network field', () => {
      const rows = BitNobService.extractMobileMoneyNetworks({
        destination_types: {
          mobile_money: { fields: [{ key: 'network', options: [{ label: 'MTN', value: 'mtn' }] }] },
        },
      });
      expect(rows).toMatchObject([{ code: 'mtn', name: 'MTN', destinationType: 'mobile_money' }]);
    });

    it('returns nothing when the country has no mobile money', () => {
      expect(BitNobService.extractMobileMoneyNetworks({ destination_types: { bank: {} } })).toEqual([]);
      expect(BitNobService.extractMobileMoneyNetworks(null)).toEqual([]);
    });
  });

  describe('listBanks', () => {
    it('offers mobile money networks when the country has no banks (Kenya)', async () => {
      const { svc, request } = make();
      request
        .mockResolvedValueOnce({ data: [] }) // /payouts/banks/KE
        .mockResolvedValueOnce({ data: { destination_types: { mobile_money: { banks: [{ code: 'mpesa', name: 'M-Pesa' }] } } } });
      const items = await svc.listBanks('KE');
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ code: 'mpesa', destinationType: 'mobile_money' });
    });

    it('lists banks AND mobile money for Ghana, using the real Bitnob shapes', async () => {
      const { svc, request } = make();
      request
        .mockResolvedValueOnce({ data: { banks: [{ bank_name: 'Access Bank GH Ltd', bank_code: 'GH280100' }], total: 1 } })
        .mockResolvedValueOnce({
          data: {
            destination_types: {
              bank: { banks: [], fields: [{ key: 'bank_code' }] },
              mobile_money: {
                banks: [],
                fields: [
                  { key: 'network', options: [{ value: 'mtn', label: 'MTN' }, { value: 'vodafone', label: 'Telecel (Vodafone)' }, { value: 'airtel', label: 'AirtelTigo' }] },
                  { key: 'account_number' },
                ],
              },
            },
          },
        });
      const items = await svc.listBanks('GH');
      expect(items.map((b: any) => b.bank_code ?? b.code)).toEqual(['GH280100', 'mtn', 'vodafone', 'airtel']);
      expect(await svc.destinationTypeFor('GH', 'mtn')).toBe('mobile_money');
      expect(await svc.destinationTypeFor('GH', 'GH280100')).toBe('bank');
    });

    it('handles Kenya as Bitnob returns it: no banks (null), M-Pesa under the network field', async () => {
      const { svc, request } = make();
      request
        .mockResolvedValueOnce({ data: { banks: null, country_code: 'KE', total: 0 } })
        .mockResolvedValueOnce({
          data: {
            destination_types: {
              mobile_money: { banks: [], fields: [{ key: 'network', options: [{ value: 'mpesa', label: 'Mpesa' }] }, { key: 'account_name' }, { key: 'account_number' }] },
              paybill: { fields: [{ key: 'network', options: [{ value: 'mpesa', label: 'Mpesa' }] }] },
              swift: { fields: [] },
            },
          },
        });
      const items = await svc.listBanks('KE');
      expect(items).toMatchObject([{ code: 'mpesa', name: 'Mpesa', destinationType: 'mobile_money' }]);
    });

    it('does not cache an empty result, so a recovered API is picked up', async () => {
      const { svc, request } = make();
      request.mockResolvedValue({ data: [] });
      expect(await svc.listBanks('KE')).toEqual([]);
      const calls = request.mock.calls.length;
      await svc.listBanks('KE');
      expect(request.mock.calls.length).toBeGreaterThan(calls);
    });

    it('keeps real banks as they are', async () => {
      const { svc, request } = make();
      request.mockResolvedValueOnce({ data: [{ code: '044', name: 'Access' }] });
      expect(await svc.listBanks('NG')).toEqual([{ code: '044', name: 'Access' }]);
      expect(request).toHaveBeenCalledTimes(1);
    });
  });

  describe('destinationTypeFor', () => {
    it('is mobile_money for a mobile money network and bank for a bank code', async () => {
      const { svc, request } = make();
      request.mockResolvedValue({ data: [] }); // no banks, fall back to networks
      request.mockResolvedValueOnce({ data: [] }).mockResolvedValueOnce({
        data: { destination_types: { mobile_money: { banks: [{ code: 'MPESA', name: 'M-Pesa' }] } } },
      });
      expect(await svc.destinationTypeFor('KE', 'mpesa')).toBe('mobile_money');
      expect(await svc.destinationTypeFor('KE', '044')).toBe('bank');
    });
  });

  describe('account overview', () => {
    it('lists balances, transactions and payouts with only the params that are set', async () => {
      const { svc, request } = make();
      request.mockResolvedValue({});
      await svc.listBalances();
      await svc.listTransactions({ limit: 25, cursor: 'c1', status: '' });
      await svc.listPayouts({ limit: 20, offset: 0, status: 'success' });
      await svc.listPayouts();
      expect(request.mock.calls.map((c) => [c[0], c[1]])).toEqual([
        ['get', '/api/balances'],
        ['get', '/api/transactions?limit=25&cursor=c1'],
        ['get', '/api/payouts?limit=20&offset=0&status=success'],
        ['get', '/api/payouts'],
      ]);
    });
  });

  describe('request shapes', () => {
    it('pays mobile money by network, not bank_code', async () => {
      const { svc, request } = make();
      request.mockResolvedValue({});
      await svc.initializePayout({
        quoteId: 'q1',
        reference: 'r1',
        beneficiary: { destinationType: 'mobile_money', country: 'KE', accountName: 'Jane', accountNumber: '254700000000', bankCode: 'MPESA' },
      });
      const body = request.mock.calls[0][2];
      expect(body.beneficiary).toMatchObject({ destination_type: 'mobile_money', network: 'mpesa', account_number: '254700000000' });
      expect(body.beneficiary.bank_code).toBeUndefined();
    });

    it('still pays banks by bank_code', async () => {
      const { svc, request } = make();
      request.mockResolvedValue({});
      await svc.initializePayout({
        quoteId: 'q1',
        reference: 'r1',
        beneficiary: { destinationType: 'bank', country: 'NG', accountName: 'A', accountNumber: '0000000001', bankCode: '044' },
      });
      expect(request.mock.calls[0][2].beneficiary).toMatchObject({ destination_type: 'bank', bank_code: '044' });
    });

    it('looks up mobile money with type=mobile_money and the network as bank_code', async () => {
      const { svc, request } = make();
      request.mockResolvedValue({});
      await svc.accountLookup('MPESA', '254700000000', 'KE', 'mobile_money');
      const url = request.mock.calls[0][1] as string;
      expect(url).toContain('type=mobile_money');
      expect(url).toContain('bank_code=MPESA');
      await svc.accountLookup('044', '0000000001', 'NG');
      expect(request.mock.calls[1][1]).not.toContain('type=');
    });
  });
});

describe('BitNobService signing secret', () => {
  const make = (env: Record<string, string>) =>
    new BitNobService({ get: (k: string) => env[k] } as any, {} as any);

  it('reads BITNOB_KEY (trimmed)', () => {
    expect(make({ BITNOB_CLIENT_ID: 'cid', BITNOB_KEY: ' secret \n' }).isConfigured()).toBe(true);
  });

  it('no longer falls back to BITNOB_API_KEY', () => {
    expect(make({ BITNOB_CLIENT_ID: 'cid', BITNOB_API_KEY: 'secret' }).isConfigured()).toBe(false);
  });
});

describe('bitnob.service — pure helpers', () => {
  describe('BitNobService.sanitizeName', () => {
    it('strips digits and symbols', () => {
      expect(BitNobService.sanitizeName('adewuyitimothy10', 'X')).toBe('adewuyitimothy');
      expect(BitNobService.sanitizeName("Mary-Jane O'Neil 2", 'X')).toBe("Mary-Jane O'Neil");
    });
    it('falls back when nothing usable remains', () => {
      expect(BitNobService.sanitizeName('1234', 'Customer')).toBe('Customer');
      expect(BitNobService.sanitizeName(undefined, 'Customer')).toBe('Customer');
    });
  });
  describe('buildBitnobAuthHeaders', () => {
    it('signs the payload with HMAC-SHA256 hex', () => {
      const headers = buildBitnobAuthHeaders('cid', 'secret', '{"a":1}');
      expect(headers['X-Auth-Client']).toBe('cid');
      expect(headers['Content-Type']).toBe('application/json');

      const ts = headers['X-Auth-Timestamp'];
      const nonce = headers['X-Auth-Nonce'];
      const expected = createHmac('sha256', 'secret')
        .update(`cid:${ts}:${nonce}:{"a":1}`)
        .digest('hex');
      expect(headers['X-Auth-Signature']).toBe(expected);
      expect(headers['X-Auth-Signature']).toMatch(/^[0-9a-f]{64}$/);
    });

    it('uses an empty string for an undefined body', () => {
      const headers = buildBitnobAuthHeaders('cid', 'secret', undefined);
      const expected = createHmac('sha256', 'secret')
        .update(
          `cid:${headers['X-Auth-Timestamp']}:${headers['X-Auth-Nonce']}:`,
        )
        .digest('hex');
      expect(headers['X-Auth-Signature']).toBe(expected);
    });
  });

  describe('deepPick', () => {
    it('finds a nested snake_case key across sources', () => {
      expect(
        deepPick(
          [{ data: { payout: { payment_address: 'GABC123' } } }],
          ['payment_address'],
        ),
      ).toBe('GABC123');
    });

    it('normalizes dashes and underscores', () => {
      expect(deepPick([{ 'expires-at': '2026-01-01' }], ['expires_at'])).toBe(
        '2026-01-01',
      );
    });

    it('respects source priority order', () => {
      expect(deepPick([{ amount: 1 }, { amount: 2 }], ['amount'])).toBe(1);
    });

    it('returns undefined when the key is not found', () => {
      expect(deepPick([{ a: 1 }], ['missing'])).toBeUndefined();
    });
  });

  describe('extractPayoutDeposit', () => {
    it('extracts address/amount/memo/expiry from finalize first', () => {
      const quote = { amount: '10' };
      const initialize = { data: { memo: 'm-init' } };
      const finalize = {
        data: {
          payout: {
            payment_address: 'GABC',
            amount_to_pay: '12.34',
            memo: 'm-fin',
            expires_at: '2026-01-01T00:00:00Z',
          },
        },
      };
      expect(extractPayoutDeposit(quote, initialize, finalize)).toEqual({
        paymentAddress: 'GABC',
        amountToPay: '12.34',
        memo: 'm-fin',
        expiresAt: '2026-01-01T00:00:00Z',
      });
    });

    it('falls back to quote.amount when no amount_to_pay is present', () => {
      expect(extractPayoutDeposit({ amount: '9.99' }, {}, {}).amountToPay).toBe(
        '9.99',
      );
    });

    it('returns an empty object when nothing is found', () => {
      expect(extractPayoutDeposit(undefined, undefined, undefined)).toEqual({});
    });
  });
});

describe('BitNobService', () => {
  let service: BitNobService;
  let httpService: { request: jest.Mock };
  let configService: { get: jest.Mock };

  beforeEach(async () => {
    httpService = { request: jest.fn() };
    configService = {
      get: jest.fn((key: string) => {
        const map: Record<string, string> = {
          BITNOB_API_URL: 'https://api.bitnob.com',
          BITNOB_CLIENT_ID: 'test-client-id',
          BITNOB_KEY: 'test-secret',
          BITNOB_SYNTHETIC_KYC: 'true',
        };
        return map[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BitNobService,
        { provide: HttpService, useValue: httpService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<BitNobService>(BitNobService);
  });

  it('isConfigured returns true when id and secret are present', () => {
    expect(service.isConfigured()).toBe(true);
  });

  it('isConfigured returns false when secret is missing', async () => {
    configService.get.mockImplementation((key: string) =>
      key === 'BITNOB_CLIENT_ID' ? 'cid' : undefined,
    );
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BitNobService,
        { provide: HttpService, useValue: httpService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();
    const svc = module.get<BitNobService>(BitNobService);
    expect(svc.isConfigured()).toBe(false);
  });

  it('createCustomer sends synthetic KYC body in sandbox', async () => {
    httpService.request.mockReturnValue(of({ data: { id: 'cust-1' } }));
    const result = await service.createCustomer({ email: 'john@example.com' });

    expect(result).toEqual({ id: 'cust-1' });
    const [config] = httpService.request.mock.calls[0];
    expect(config.method).toBe('post');
    expect(config.url).toBe('https://api.bitnob.com/api/customers');
    const body = JSON.parse(config.data);
    expect(body.email).toBe('john@example.com');
    expect(body.first_name).toBe('john');
    expect(body.last_name).toBe('Customer');
    expect(body.id_type).toBe('bvn');
    expect(body.id_number).toMatch(/^\d{11}$/);
    expect(body.phone_number).toMatch(/^080\d{9}$/);
    expect(body.dial_code).toBe('+234');
    expect(body.country).toBe('NGA');
    expect(body.date_of_birth).toBe('1990-01-01');
  });

  it('createCustomer uses provided name and phone when available', async () => {
    httpService.request.mockReturnValue(of({ data: { id: 'cust-2' } }));
    await service.createCustomer({
      email: 'jane@example.com',
      firstName: 'Jane',
      lastName: 'Doe',
      phoneNumber: '08123456789',
    });
    const [config] = httpService.request.mock.calls[0];
    const body = JSON.parse(config.data);
    expect(body.first_name).toBe('Jane');
    expect(body.last_name).toBe('Doe');
    expect(body.phone_number).toBe('08123456789');
  });

  it('createPayoutQuote posts onchain quote fields', async () => {
    httpService.request.mockReturnValue(of({ data: { quote_id: 'QT2_1' } }));
    await service.createPayoutQuote({
      fromAsset: 'USDC',
      toCurrency: 'NGN',
      country: 'NG',
      source: 'onchain',
      settlementAmount: 5000,
      reference: 'off_1',
      chain: 'STELLAR',
    });
    const [config] = httpService.request.mock.calls[0];
    const body = JSON.parse(config.data);
    expect(body).toMatchObject({
      from_asset: 'USDC',
      to_currency: 'NGN',
      country: 'NG',
      source: 'onchain',
      settlement_amount: '5000', // Bitnob rejects a JSON number here with 400 "Invalid request body"
      chain: 'STELLAR',
      reference: 'off_1',
    });
  });

  describe('createPayoutQuote settlement_amount', () => {
    const quote = (settlementAmount: number) =>
      service.createPayoutQuote({
        fromAsset: 'USDC',
        toCurrency: 'NGN',
        country: 'NG',
        source: 'onchain',
        settlementAmount,
        reference: 'r',
        chain: 'BASE',
      });
    const sentAmount = () =>
      JSON.parse(httpService.request.mock.calls[0][0].data).settlement_amount;

    it.each([
      [2000, '2000'],
      [2000.5, '2000.5'],
      [1_500_000, '1500000'],
      [0.01, '0.01'],
    ])('sends %p as the JSON string %p', async (n, expected) => {
      httpService.request.mockReturnValue(of({ data: {} }));
      await quote(n);
      expect(sentAmount()).toBe(expected);
      expect(typeof sentAmount()).toBe('string');
    });

    it.each([0, -5, NaN, Infinity])('refuses to send %p', async (n) => {
      await expect(quote(n)).rejects.toThrow(/settlementAmount/);
      expect(httpService.request).not.toHaveBeenCalled();
    });
  });

  describe('trading quote and order amounts', () => {
    const sent = () => JSON.parse(httpService.request.mock.calls[0][0].data);

    it('tradingQuote sends quantity as a decimal string', async () => {
      httpService.request.mockReturnValue(of({ data: {} }));
      await service.tradingQuote({
        baseCurrency: 'NGN',
        quoteCurrency: 'USDC',
        side: 'sell',
        quantity: 5000,
      });
      expect(sent()).toEqual({
        base_currency: 'NGN',
        quote_currency: 'USDC',
        side: 'sell',
        quantity: '5000',
      });
    });

    it('tradingOrder sends BOTH quantity and price as decimal strings', async () => {
      httpService.request.mockReturnValue(of({ data: {} }));
      await service.tradingOrder({
        baseCurrency: 'NGN',
        quoteCurrency: 'USDC',
        side: 'sell',
        quantity: 5000.5,
        price: 0.0007,
        quoteId: 'QT_1',
        reference: 'TRD_1',
      });
      const body = sent();
      expect(body.quantity).toBe('5000.5');
      expect(body.price).toBe('0.0007');
      expect(body).toMatchObject({ quote_id: 'QT_1', reference: 'TRD_1' });
    });

    it('accepts a price that already arrived from Bitnob as a string, untouched', async () => {
      httpService.request.mockReturnValue(of({ data: {} }));
      await service.tradingOrder({
        baseCurrency: 'NGN',
        quoteCurrency: 'USDC',
        side: 'sell',
        quantity: 100,
        price: ' 0.00071234 ' as any,
        quoteId: 'QT_1',
        reference: 'TRD_2',
      });
      expect(sent().price).toBe('0.00071234');
    });

    it.each([0, -1, NaN, Infinity])(
      'refuses a quantity of %p without calling Bitnob',
      async (q) => {
        await expect(
          service.tradingQuote({
            baseCurrency: 'NGN',
            quoteCurrency: 'USDC',
            side: 'sell',
            quantity: q,
          }),
        ).rejects.toThrow(/quantity/);
        expect(httpService.request).not.toHaveBeenCalled();
      },
    );

    it('refuses an unusable price', async () => {
      await expect(
        service.tradingOrder({
          baseCurrency: 'NGN',
          quoteCurrency: 'USDC',
          side: 'sell',
          quantity: 1,
          price: 0,
          quoteId: 'q',
          reference: 'r',
        }),
      ).rejects.toThrow(/price/);
      expect(httpService.request).not.toHaveBeenCalled();
    });
  });

  describe('extractBitnobQuoteId', () => {
    it('reads the quote id from the current nested response, preferring quote_id over the uuid', () => {
      expect(
        extractBitnobQuoteId({
          data: { payout: { id: 'uuid-1', quote_id: 'QT2_21878422' } },
        }),
      ).toBe('QT2_21878422');
    });
    it('still reads older shapes', () => {
      expect(extractBitnobQuoteId({ data: { quote_id: 'QT2_1' } })).toBe(
        'QT2_1',
      );
      expect(extractBitnobQuoteId({ data: { id: 'abc' } })).toBe('abc');
      expect(extractBitnobQuoteId({ quote_id: 'QT2_2' })).toBe('QT2_2');
    });
    it('falls back to the uuid when there is no quote_id, and to undefined when there is nothing', () => {
      expect(extractBitnobQuoteId({ data: { payout: { id: 'uuid-1' } } })).toBe(
        'uuid-1',
      );
      expect(extractBitnobQuoteId({ data: {} })).toBeUndefined();
      expect(extractBitnobQuoteId(undefined)).toBeUndefined();
    });
  });

  it('createWithdrawal posts minor-unit amount with stellar chain', async () => {
    httpService.request.mockReturnValue(of({ data: { transaction_id: 'w1' } }));
    await service.createWithdrawal({
      toAddress: 'GABC',
      amount: 1234567,
      reference: 'WDR_ref',
      memo: '',
    });
    const [config] = httpService.request.mock.calls[0];
    const body = JSON.parse(config.data);
    expect(body).toMatchObject({
      to_address: 'GABC',
      amount: '1234567',
      currency: 'USDC',
      chain: 'stellar',
      reference: 'WDR_ref',
    });
  });

  it('lists banks with the country as a path segment', async () => {
    httpService.request.mockReturnValue(
      of({ data: { data: [{ code: '000013', name: 'GTBank' }] } }),
    );

    const banks = await service.listBanks('KE');

    const [config] = httpService.request.mock.calls[0];
    expect(config.method).toBe('get');
    expect(config.url).toBe('https://api.bitnob.com/api/payouts/banks/KE');
    expect(banks).toHaveLength(1);
  });

  it('looks up an account with GET and query params, no body', async () => {
    httpService.request.mockReturnValue(
      of({ data: { data: { account_name: 'Ada Okafor' } } }),
    );

    await service.accountLookup('090267', '2041363986', 'NG');

    const [config] = httpService.request.mock.calls[0];
    expect(config.method).toBe('get');
    expect(config.url).toBe(
      'https://api.bitnob.com/api/payouts/account-lookup?country=NG&account_number=2041363986&bank_code=090267',
    );
    expect(config.data).toBeUndefined();
  });

  it('maps a 403 into BAD_GATEWAY with an IP-whitelist hint', async () => {
    const axiosError = new AxiosError(
      'Request failed',
      'ERR_BAD_REQUEST',
      undefined as any,
      undefined,
      {
        status: 403,
        statusText: 'Forbidden',
        data: { detail: 'IP address not whitelisted' },
        headers: {},
        config: {} as any,
      } as any,
    );
    httpService.request.mockImplementation(() => {
      throw axiosError;
    });

    await expect(service.whoami()).rejects.toThrow(
      'IP address not whitelisted Ensure this egress IP is whitelisted',
    );
  });

  it('does not suggest IP whitelisting for a non-IP 403', async () => {
    const axiosError = new AxiosError(
      'Request failed',
      'ERR_BAD_REQUEST',
      undefined as any,
      undefined,
      {
        status: 403,
        statusText: 'Forbidden',
        data: { message: 'The customers feature is currently not available.' },
        headers: {},
        config: {} as any,
      } as any,
    );
    httpService.request.mockImplementation(() => {
      throw axiosError;
    });

    const err: any = await service.whoami().catch((e) => e);
    expect(err.message).toContain('customers feature is currently not available');
    expect(err.message).not.toMatch(/whitelist/i);
  });
});
