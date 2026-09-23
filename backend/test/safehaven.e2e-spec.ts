import request from 'supertest';
import { of, throwError } from 'rxjs';
import { AxiosError } from 'axios';
import { Keypair } from '@stellar/stellar-sdk';
import { createTestApp, TestApp } from './utils/test-app';
import { createTestUser, signJwtFor } from './utils/auth-helpers';

const tokenResponse = {
  data: { access_token: 'access-token-1', ibs_client_id: 'ibs-client-1', expires_in: 2399, token_type: 'Bearer' },
};

/**
 * SafeHavenRampProcessor is a singleton for the app's lifetime and caches
 * its auth token across requests, so the number of HTTP calls per request
 * isn't fixed (a token exchange only happens once). Routing by URL instead
 * of strict call-order sequencing keeps these tests independent of that
 * caching detail.
 */
function routeHttpPostByUrl(httpService: TestApp['httpService'], routes: Record<string, () => any>) {
  httpService.post.mockImplementation((url: string) => {
    if (url.includes('/oauth2/token')) return of(tokenResponse);
    for (const [pathFragment, handler] of Object.entries(routes)) {
      if (url.includes(pathFragment)) return handler();
    }
    throw new Error(`Unmocked SafeHaven POST call: ${url}`);
  });
}

describe('SafeHaven ramp processor (e2e)', () => {
  let ctx: TestApp;
  let token: string;
  const originalProvider = process.env.RAMP_PROCESSOR_PROVIDER;
  const originalWebhookUrl = process.env.WEBHOOK_URL;

  beforeAll(async () => {
    // Isolated from the other e2e suites (which assume Flint is active) —
    // set before createTestApp so the module factory picks it up. Unlike
    // Flint/Paystack, SafeHaven's per-transaction callbackUrl is required,
    // so WEBHOOK_URL must be set too (unset elsewhere since Flint/Paystack
    // tolerate it being absent).
    process.env.RAMP_PROCESSOR_PROVIDER = 'safehaven';
    process.env.WEBHOOK_URL = 'https://autoramp.example.com/stablestack/webhook';
    ctx = await createTestApp('safehaven-e2e');
    const user = await createTestUser(ctx.prisma as any);
    token = signJwtFor(user);
  });

  afterAll(async () => {
    process.env.RAMP_PROCESSOR_PROVIDER = originalProvider;
    process.env.WEBHOOK_URL = originalWebhookUrl;
    await ctx.cleanup();
  });

  describe('POST /stablestack/onramp', () => {
    it('creates a SafeHaven virtual account and stores it as the deposit account', async () => {
      const destination = Keypair.random().publicKey();
      routeHttpPostByUrl(ctx.httpService, {
        '/virtual-accounts': () =>
          of({
            data: { data: { _id: 'va-1', accountNumber: '6020017561', accountName: 'AutoRamp Checkout' } },
          }),
      });

      const res = await request(ctx.app.getHttpServer())
        .post('/stablestack/onramp')
        .set('Authorization', `Bearer ${token}`)
        .send({ network: 'stellar', amount: 10000, destination: { address: destination } });

      expect(res.status).toBe(201);
      const row = await (ctx.prisma as any).onrampTransaction.findUnique({
        where: { reference: res.body.databaseRecord.reference },
      });
      expect(row.flintTransactionId).toBe('va-1');
      expect((row.depositAccount as any).accountNumber).toBe('6020017561');
    });
  });

  describe('POST /stablestack/webhook/safehaven', () => {
    it('re-verifies via SafeHaven and completes the matching onramp', async () => {
      const destination = Keypair.random().publicKey();
      routeHttpPostByUrl(ctx.httpService, {
        '/virtual-accounts': () =>
          of({
            data: { data: { _id: 'va-2', accountNumber: '6020017562', accountName: 'AutoRamp Checkout' } },
          }),
      });
      const onrampRes = await request(ctx.app.getHttpServer())
        .post('/stablestack/onramp')
        .set('Authorization', `Bearer ${token}`)
        .send({ network: 'stellar', amount: 10000, destination: { address: destination } });
      const reference = onrampRes.body.databaseRecord.reference;

      ctx.stellarService.sendFromDistribution.mockResolvedValue('mintHashSafeHavenE2e');

      const notFound = new AxiosError('Bad Request');
      (notFound as any).response = { status: 400 };
      routeHttpPostByUrl(ctx.httpService, {
        '/transfers/status': () => throwError(() => notFound), // not a transfer — miss
        '/virtual-accounts/status': () =>
          of({ data: { data: { status: 'Completed', externalReference: reference } } }),
      });

      const res = await request(ctx.app.getHttpServer())
        .post('/stablestack/webhook/safehaven')
        .send({ data: { sessionId: 'sess-1' } });

      expect(res.status).toBe(201);

      const row = await (ctx.prisma as any).onrampTransaction.findUnique({ where: { reference } });
      expect(row.status).toBe('COMPLETED');
    });

    it('rejects when a shared secret is configured and the key is missing', async () => {
      const original = process.env.SAFEHAVEN_WEBHOOK_SHARED_SECRET;
      process.env.SAFEHAVEN_WEBHOOK_SHARED_SECRET = 'expected-secret';
      try {
        const res = await request(ctx.app.getHttpServer())
          .post('/stablestack/webhook/safehaven')
          .send({ data: { sessionId: 'sess-2' } });
        expect(res.status).toBe(401);
      } finally {
        process.env.SAFEHAVEN_WEBHOOK_SHARED_SECRET = original;
      }
    });
  });
});
