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
  extractPayoutDeposit,
} from './bitnob.service';

describe('bitnob.service — pure helpers', () => {
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
        .update(`cid:${headers['X-Auth-Timestamp']}:${headers['X-Auth-Nonce']}:`)
        .digest('hex');
      expect(headers['X-Auth-Signature']).toBe(expected);
    });
  });

  describe('deepPick', () => {
    it('finds a nested snake_case key across sources', () => {
      expect(
        deepPick([{ data: { payout: { payment_address: 'GABC123' } } }], [
          'payment_address',
        ]),
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
      settlement_amount: 5000,
      chain: 'STELLAR',
      reference: 'off_1',
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
      'IP not whitelisted or insufficient permission',
    );
  });
});
