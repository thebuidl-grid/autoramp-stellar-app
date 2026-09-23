import request from 'supertest';
import { of } from 'rxjs';
import * as crypto from 'crypto';
import { Keypair } from '@stellar/stellar-sdk';
import { createTestApp, TestApp } from './utils/test-app';
import { createTestUser, signJwtFor } from './utils/auth-helpers';
import { StablestackService } from '../src/modules/stablestack/stablestack.service';

describe('Stablestack endpoints (e2e)', () => {
  let ctx: TestApp;
  let token: string;

  beforeAll(async () => {
    ctx = await createTestApp('stablestack-e2e');
    const user = await createTestUser(ctx.prisma as any);
    token = signJwtFor(user);
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  describe('GET /stablestack/banks', () => {
    it('is public and proxies Flint', async () => {
      ctx.httpService.get.mockReturnValue(
        of({ data: { status: 'success', data: [{ institutionCode: '058', institutionName: 'GTBank' }] } }),
      );

      const res = await request(ctx.app.getHttpServer()).get('/stablestack/banks');

      expect(res.status).toBe(200);
      expect(res.body.data[0].institutionName).toBe('GTBank');
    });
  });

  describe('POST /stablestack/onramp', () => {
    const destination = Keypair.random().publicKey();

    it('requires authentication', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/stablestack/onramp')
        .send({ network: 'stellar', amount: 10000, destination: { address: destination } });
      expect(res.status).toBe(401);
    });

    it('rejects a non-stellar network value', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/stablestack/onramp')
        .set('Authorization', `Bearer ${token}`)
        .send({ network: 'base', amount: 10000, destination: { address: destination } });
      expect(res.status).toBe(400);
    });

    it('rejects amounts below the 100 NGN minimum', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/stablestack/onramp')
        .set('Authorization', `Bearer ${token}`)
        .send({ network: 'stellar', amount: 50, destination: { address: destination } });
      expect(res.status).toBe(400);
    });

    it('creates a real onramp transaction row via the real service + mocked Flint call', async () => {
      ctx.httpService.post.mockReturnValue(
        of({ data: { data: { transactionId: 'flint-onramp-1', depositAccount: { bankName: 'Providus' } } } }),
      );

      const res = await request(ctx.app.getHttpServer())
        .post('/stablestack/onramp')
        .set('Authorization', `Bearer ${token}`)
        .send({ network: 'stellar', amount: 10000, destination: { address: destination } });

      expect(res.status).toBe(201);
      expect(res.body.databaseRecord.status).toBe('PENDING');

      const row = await (ctx.prisma as any).onrampTransaction.findUnique({
        where: { reference: res.body.databaseRecord.reference },
      });
      expect(row.destinationAddress).toBe(destination);
      expect(row.network).toBe('stellar');
    });
  });

  describe('POST /stablestack/offramp', () => {
    it('returns the Stellar collection account + memo, not a Flint-provided address', async () => {
      ctx.httpService.post.mockReturnValue(of({ data: { data: { transactionId: 'flint-offramp-1' } } }));

      const res = await request(ctx.app.getHttpServer())
        .post('/stablestack/offramp')
        .set('Authorization', `Bearer ${token}`)
        .send({
          network: 'stellar',
          amount: 5000,
          destination: { bankCode: '058', accountNumber: '1234567890' },
        });

      expect(res.status).toBe(201);
      expect(res.body.data.depositAddress).toBe(process.env.STELLAR_DISTRIBUTION_PUBLIC_KEY);
      expect(res.body.data.memo).toEqual(expect.stringMatching(/^txn_ref_/));
    });
  });

  describe('POST /stablestack/offramp/:reference/confirm-deposit', () => {
    async function createPendingOfframp() {
      ctx.httpService.post.mockReturnValue(of({ data: { data: { transactionId: 'flint-offramp-2' } } }));
      const res = await request(ctx.app.getHttpServer())
        .post('/stablestack/offramp')
        .set('Authorization', `Bearer ${token}`)
        .send({
          network: 'stellar',
          amount: 5000,
          destination: { bankCode: '058', accountNumber: '1234567890' },
        });
      return res.body.databaseRecord.reference as string;
    }

    it('rejects a malformed transaction hash', async () => {
      const reference = await createPendingOfframp();
      const res = await request(ctx.app.getHttpServer())
        .post(`/stablestack/offramp/${reference}/confirm-deposit`)
        .set('Authorization', `Bearer ${token}`)
        .send({ transactionHash: 'not-hex' });
      expect(res.status).toBe(400);
    });

    it('moves PENDING -> PROCESSING once Horizon confirms the memo-tagged deposit', async () => {
      const reference = await createPendingOfframp();
      ctx.stellarService.getTransactionByHash.mockResolvedValue({ successful: true });
      ctx.stellarService.findIncomingPaymentByMemo.mockResolvedValue({
        amount: '5000.0000000',
        transactionHash: 'depositHash1',
      });

      const res = await request(ctx.app.getHttpServer())
        .post(`/stablestack/offramp/${reference}/confirm-deposit`)
        .set('Authorization', `Bearer ${token}`)
        .send({ transactionHash: 'a'.repeat(64) });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('PROCESSING');
    });

    it('rejects when no matching deposit is found yet', async () => {
      const reference = await createPendingOfframp();
      ctx.stellarService.getTransactionByHash.mockResolvedValue({ successful: true });
      ctx.stellarService.findIncomingPaymentByMemo.mockResolvedValue(null);

      const res = await request(ctx.app.getHttpServer())
        .post(`/stablestack/offramp/${reference}/confirm-deposit`)
        .set('Authorization', `Bearer ${token}`)
        .send({ transactionHash: 'b'.repeat(64) });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /stablestack/webhook', () => {
    it('is public (no auth) and mints CNGN when an onramp completes', async () => {
      ctx.httpService.post.mockReturnValue(
        of({ data: { data: { transactionId: 'flint-webhook-1', depositAccount: {} } } }),
      );
      const destination = Keypair.random().publicKey();
      const onrampRes = await request(ctx.app.getHttpServer())
        .post('/stablestack/onramp')
        .set('Authorization', `Bearer ${token}`)
        .send({ network: 'stellar', amount: 10000, destination: { address: destination } });
      const reference = onrampRes.body.databaseRecord.reference;

      ctx.stellarService.sendFromDistribution.mockResolvedValue('mintHash1');

      const res = await request(ctx.app.getHttpServer())
        .post('/stablestack/webhook')
        .send({ event: 'onramp.completed', data: { reference, status: 'completed' } });

      expect(res.status).toBe(201);
      expect(ctx.stellarService.sendFromDistribution).toHaveBeenCalledWith(
        expect.objectContaining({ destination }),
      );

      const row = await (ctx.prisma as any).onrampTransaction.findUnique({ where: { reference } });
      expect(row.status).toBe('COMPLETED');
      expect((row.metadata as any).mintTransactionHash).toBe('mintHash1');
    });

    it('returns 404 for an unknown reference', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/stablestack/webhook')
        .send({ event: 'onramp.completed', data: { reference: 'txn_ref_doesnotexist', status: 'completed' } });
      expect(res.status).toBe(404);
    });
  });

  describe('GET /stablestack/transactions', () => {
    it('requires authentication', async () => {
      const res = await request(ctx.app.getHttpServer()).get('/stablestack/transactions');
      expect(res.status).toBe(401);
    });

    it("returns only the authenticated user's transactions", async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/stablestack/transactions')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.onramp)).toBe(true);
      expect(Array.isArray(res.body.offramp)).toBe(true);
    });
  });

  describe('OfframpDepositWatcherService (background confirmation, no client callback)', () => {
    it('confirms a PENDING offramp on its own once Horizon shows the memo-tagged deposit', async () => {
      ctx.httpService.post.mockReturnValue(of({ data: { data: { transactionId: 'flint-watcher-1' } } }));
      const createRes = await request(ctx.app.getHttpServer())
        .post('/stablestack/offramp')
        .set('Authorization', `Bearer ${token}`)
        .send({
          network: 'stellar',
          amount: 5000,
          destination: { bankCode: '058', accountNumber: '1234567890' },
        });
      const reference = createRes.body.databaseRecord.reference;

      // Simulate the user having sent CNGN without ever calling
      // confirm-deposit — this is exactly the stuck-forever case the
      // watcher exists to fix.
      ctx.stellarService.findIncomingPaymentByMemo.mockResolvedValue({
        amount: '5000.0000000',
        transactionHash: 'watcherDiscoveredHash',
      });

      const stablestackService = ctx.app.get(StablestackService);
      const result = await stablestackService.findAndConfirmPendingDeposits();

      expect(result.confirmed).toBeGreaterThanOrEqual(1);
      const row = await (ctx.prisma as any).offrampTransaction.findUnique({ where: { reference } });
      expect(row.status).toBe('PROCESSING');
    });

    it('leaves unmatched PENDING offramps alone', async () => {
      ctx.httpService.post.mockReturnValue(of({ data: { data: { transactionId: 'flint-watcher-2' } } }));
      const createRes = await request(ctx.app.getHttpServer())
        .post('/stablestack/offramp')
        .set('Authorization', `Bearer ${token}`)
        .send({
          network: 'stellar',
          amount: 5000,
          destination: { bankCode: '058', accountNumber: '1234567890' },
        });
      const reference = createRes.body.databaseRecord.reference;

      ctx.stellarService.findIncomingPaymentByMemo.mockResolvedValue(null);

      const stablestackService = ctx.app.get(StablestackService);
      await stablestackService.findAndConfirmPendingDeposits();

      const row = await (ctx.prisma as any).offrampTransaction.findUnique({ where: { reference } });
      expect(row.status).toBe('PENDING');
    });
  });

  describe('POST /stablestack/webhook/paystack', () => {
    function sign(body: string): string {
      return crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY as string).update(body).digest('hex');
    }

    it('rejects a request with no signature header', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/stablestack/webhook/paystack')
        .send({ event: 'charge.success', data: {} });
      expect(res.status).toBe(401);
    });

    it('rejects a request with an invalid signature', async () => {
      const body = JSON.stringify({ event: 'charge.success', data: {} });
      const res = await request(ctx.app.getHttpServer())
        .post('/stablestack/webhook/paystack')
        .set('x-paystack-signature', 'not-the-right-signature')
        .set('Content-Type', 'application/json')
        .send(body);
      expect(res.status).toBe(401);
    });

    it('accepts a correctly-signed charge.success and confirms the matching DVA onramp', async () => {
      ctx.httpService.post.mockReturnValue(
        of({ data: { data: { transactionId: 'flint-onramp-paystack-e2e', depositAccount: { accountNumber: '9990001234' } } } }),
      );
      const destination = Keypair.random().publicKey();
      const onrampRes = await request(ctx.app.getHttpServer())
        .post('/stablestack/onramp')
        .set('Authorization', `Bearer ${token}`)
        .send({ network: 'stellar', amount: 10000, destination: { address: destination } });
      const reference = onrampRes.body.databaseRecord.reference;

      ctx.stellarService.sendFromDistribution.mockResolvedValue('mintHashPaystackE2e');

      const body = JSON.stringify({
        event: 'charge.success',
        data: { channel: 'dedicated_nuban', receiver_account_number: '9990001234', amount: 1000000 },
      });

      const res = await request(ctx.app.getHttpServer())
        .post('/stablestack/webhook/paystack')
        .set('x-paystack-signature', sign(body))
        .set('Content-Type', 'application/json')
        .send(body);

      expect(res.status).toBe(201);

      const row = await (ctx.prisma as any).onrampTransaction.findUnique({ where: { reference } });
      expect(row.status).toBe('COMPLETED');
    });
  });
});
