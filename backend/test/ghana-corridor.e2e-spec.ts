import request from 'supertest';
import { of, throwError } from 'rxjs';
import { AxiosError } from 'axios';
import * as crypto from 'crypto';
import { Keypair } from '@stellar/stellar-sdk';
import { createTestApp, TestApp } from './utils/test-app';
import { createTestUser, signJwtFor } from './utils/auth-helpers';
import { StablestackService } from '../src/modules/stablestack/stablestack.service';

/**
 * Proves the second corridor (GH/GHS) actually works end to end through
 * the corridor-aware routing built to support it — not just that the DB
 * row exists. NG/NGN stays on its usual default processor; this corridor
 * routes to Paystack (real Ghana support — DVAs + GhIPSS transfers,
 * confirmed against Paystack's docs) purely via CorridorService +
 * RampProcessorRegistry, with no special-casing in StablestackService.
 *
 * PaystackRampProcessor's customer lookup is keyed by email and caches
 * nothing itself (every call hits the mocked HttpService), so each test
 * that creates a fresh onramp uses its own user/email — otherwise a
 * later test would see the earlier test's "existing customer" via the
 * same email and skip customer/DVA creation entirely.
 */
function routePaystackHttpByUrl(
  httpService: TestApp['httpService'],
  routes: { get?: Record<string, () => any>; post?: Record<string, () => any> },
) {
  httpService.get.mockImplementation((url: string) => {
    for (const [fragment, handler] of Object.entries(routes.get || {})) {
      if (url.includes(fragment)) return handler();
    }
    throw new Error(`Unmocked GET call: ${url}`);
  });
  httpService.post.mockImplementation((url: string) => {
    for (const [fragment, handler] of Object.entries(routes.post || {})) {
      if (url.includes(fragment)) return handler();
    }
    throw new Error(`Unmocked POST call: ${url}`);
  });
}

const notFound = (() => {
  const err = new AxiosError('Not found');
  (err as any).response = { status: 404 };
  return err;
})();

describe('Ghana corridor (GH/GHS) end-to-end (e2e)', () => {
  let ctx: TestApp;
  let token: string;
  const cghsIssuer = process.env.CNGN_ISSUER_PUBLIC_KEY as string; // same issuer as CNGN, different asset code

  beforeAll(async () => {
    ctx = await createTestApp('ghana-corridor-e2e');
    const user = await createTestUser(ctx.prisma as any);
    token = signJwtFor(user);

    await (ctx.prisma as any).corridor.create({
      data: {
        countryCode: 'GH',
        fiatCurrency: 'GHS',
        stablecoinCode: 'CGHS',
        stablecoinIssuer: cghsIssuer,
        rampProcessorProvider: 'paystack',
        licensingStatus: 'UNLICENSED',
        isActive: true,
      },
    });
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  describe('POST /stablestack/onramp (currency=GHS)', () => {
    it('routes to Paystack, creates a GHS DVA, and stores CGHS as the tokenType', async () => {
      const destination = Keypair.random().publicKey();
      routePaystackHttpByUrl(ctx.httpService, {
        get: { '/customer/': () => throwError(() => notFound) },
        post: {
          '/customer': () => of({ data: { data: { customer_code: 'CUS_gh_1' } } }),
          '/dedicated_account': () =>
            of({
              data: { data: { account_number: '5010009999', account_name: 'AutoRamp/Kwame', bank: { name: 'GCB' } } },
            }),
        },
      });

      const res = await request(ctx.app.getHttpServer())
        .post('/stablestack/onramp')
        .set('Authorization', `Bearer ${token}`)
        .send({
          network: 'stellar',
          amount: 500,
          destination: { address: destination },
          currency: 'GHS',
        });

      expect(res.status).toBe(201);
      const row = await (ctx.prisma as any).onrampTransaction.findUnique({
        where: { reference: res.body.databaseRecord.reference },
      });
      expect(row.currency).toBe('GHS');
      expect(row.tokenType).toBe('CGHS');
      expect((row.depositAccount as any).accountNumber).toBe('5010009999');
    });
  });

  describe('POST /stablestack/webhook/paystack (GHS DVA credit)', () => {
    it('mints CGHS (not CNGN) from the distribution account', async () => {
      const user2 = await createTestUser(ctx.prisma as any);
      const token2 = signJwtFor(user2);
      const destination = Keypair.random().publicKey();
      routePaystackHttpByUrl(ctx.httpService, {
        get: { '/customer/': () => throwError(() => notFound) },
        post: {
          '/customer': () => of({ data: { data: { customer_code: 'CUS_gh_2' } } }),
          '/dedicated_account': () =>
            of({ data: { data: { account_number: '5010008888', account_name: 'AutoRamp/Ama', bank: {} } } }),
        },
      });

      const onrampRes = await request(ctx.app.getHttpServer())
        .post('/stablestack/onramp')
        .set('Authorization', `Bearer ${token2}`)
        .send({ network: 'stellar', amount: 500, destination: { address: destination }, currency: 'GHS' });
      const reference = onrampRes.body.databaseRecord.reference;

      ctx.stellarService.sendFromDistribution.mockResolvedValue('mintHashGhs1');

      const body = JSON.stringify({
        event: 'charge.success',
        data: { channel: 'dedicated_nuban', receiver_account_number: '5010008888', amount: 50000 },
      });
      const signature = crypto
        .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY as string)
        .update(body)
        .digest('hex');

      const res = await request(ctx.app.getHttpServer())
        .post('/stablestack/webhook/paystack')
        .set('x-paystack-signature', signature)
        .set('Content-Type', 'application/json')
        .send(body);

      expect(res.status).toBe(201);
      expect(ctx.stellarService.sendFromDistribution).toHaveBeenCalledWith(
        expect.objectContaining({
          destination,
          asset: expect.objectContaining({ code: 'CGHS', issuer: cghsIssuer }),
        }),
      );

      const row = await (ctx.prisma as any).onrampTransaction.findUnique({ where: { reference } });
      expect(row.status).toBe('COMPLETED');
    });
  });

  describe('POST /stablestack/offramp (currency=GHS)', () => {
    it('validates the bank account but does not move any fiat yet, and stores CGHS as the tokenType', async () => {
      routePaystackHttpByUrl(ctx.httpService, {
        get: { '/bank/resolve': () => of({ data: { data: { account_name: 'KWAME MENSAH' } } }) },
      });

      const res = await request(ctx.app.getHttpServer())
        .post('/stablestack/offramp')
        .set('Authorization', `Bearer ${token}`)
        .send({
          network: 'stellar',
          amount: 200,
          destination: { bankCode: '030', accountNumber: '1234567890' },
          currency: 'GHS',
        });

      expect(res.status).toBe(201);
      const row = await (ctx.prisma as any).offrampTransaction.findUnique({
        where: { reference: res.body.databaseRecord.reference },
      });
      expect(row.tokenType).toBe('CGHS');
      expect(row.accountName).toBe('KWAME MENSAH');
      expect(row.flintTransactionId).toBeNull(); // no payout has happened yet
    });

    it('watches for the CGHS deposit specifically (not CNGN), and only then pays out via ghipss', async () => {
      routePaystackHttpByUrl(ctx.httpService, {
        get: { '/bank/resolve': () => of({ data: { data: { account_name: 'KWAME MENSAH' } } }) },
        post: {
          '/transferrecipient': () => of({ data: { data: { recipient_code: 'RCP_gh_2' } } }),
          '/transfer': () => of({ data: { data: { transfer_code: 'TRF_gh_2' } } }),
        },
      });

      const createRes = await request(ctx.app.getHttpServer())
        .post('/stablestack/offramp')
        .set('Authorization', `Bearer ${token}`)
        .send({
          network: 'stellar',
          amount: 200,
          destination: { bankCode: '030', accountNumber: '1234567890' },
          currency: 'GHS',
        });
      const reference = createRes.body.databaseRecord.reference;

      // No fiat payout call yet — only the safe, non-money-moving
      // resolveAccount call happened during creation.
      expect(ctx.httpService.post.mock.calls.some(([url]) => url.includes('/transfer'))).toBe(false);

      ctx.stellarService.findIncomingPaymentByMemo.mockResolvedValue({
        amount: '200.0000000',
        transactionHash: 'ghsDepositHash',
      });

      const stablestackService = ctx.app.get(StablestackService);
      await stablestackService.findAndConfirmPendingDeposits();

      expect(ctx.stellarService.findIncomingPaymentByMemo).toHaveBeenCalledWith(
        expect.anything(),
        reference,
        expect.objectContaining({ code: 'CGHS', issuer: cghsIssuer }),
      );

      const [, recipientBody] = ctx.httpService.post.mock.calls.find(([url]) => url.includes('/transferrecipient'))!;
      expect(recipientBody).toEqual(expect.objectContaining({ type: 'ghipss', currency: 'GHS' }));

      const row = await (ctx.prisma as any).offrampTransaction.findUnique({ where: { reference } });
      expect(row.status).toBe('PROCESSING');
      expect(row.flintTransactionId).toBe('TRF_gh_2'); // payout transfer_code, recorded once the payout executed
    });
  });

  describe('GET /swap/quote (CGHS <-> USDC, the hub-and-spoke path)', () => {
    it('resolves CGHS via the corridor registry for a quote', async () => {
      ctx.stellarService.getStrictSendQuote.mockResolvedValue({
        sourceAmount: '100.0000000',
        destinationAmount: '1200.0000000',
      });

      const res = await request(ctx.app.getHttpServer())
        .get('/swap/quote')
        .query({ fromToken: 'USDC', toToken: 'CGHS', amount: 100 });

      expect(res.status).toBe(200);
      expect(res.body.destAsset).toEqual({ code: 'CGHS', issuer: cghsIssuer });
    });

    it('rejects a stablecoin code with no corridor (SwapService wraps the lookup failure as 400)', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/swap/quote')
        .query({ fromToken: 'USDC', toToken: 'CXYZ', amount: 100 });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /swap/balances', () => {
    it('includes cghs alongside usdc — dynamic over the corridor registry', async () => {
      const address = Keypair.random().publicKey();
      ctx.stellarService.getBalances.mockResolvedValue({ usdc: '50', cngn: '0', cghs: '1000' });

      const res = await request(ctx.app.getHttpServer()).get('/swap/balances').query({ address });

      expect(res.status).toBe(200);
      expect(res.body.cghs).toBe('1000');
      const [, assets] = ctx.stellarService.getBalances.mock.calls[0];
      expect(Object.keys(assets)).toEqual(expect.arrayContaining(['usdc', 'cghs']));
    });
  });
});
