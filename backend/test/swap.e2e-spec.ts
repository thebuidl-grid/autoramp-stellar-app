import request from 'supertest';
import { of } from 'rxjs';
import { Keypair } from '@stellar/stellar-sdk';
import { createTestApp, TestApp } from './utils/test-app';
import { createTestUser, signJwtFor } from './utils/auth-helpers';

describe('Swap endpoints (e2e)', () => {
  let ctx: TestApp;
  let token: string;
  let userId: string;

  beforeAll(async () => {
    ctx = await createTestApp('swap-e2e');
    const user = await createTestUser(ctx.prisma as any);
    userId = user.id;
    token = signJwtFor(user);

    // A second corridor so "sell into a non-default corridor" is a real
    // test, not just the app-wide default — same issuer as CNGN (a single
    // Stellar account can issue multiple asset codes), different code.
    await (ctx.prisma as any).corridor.create({
      data: {
        countryCode: 'GH',
        fiatCurrency: 'GHS',
        stablecoinCode: 'CGHS',
        stablecoinIssuer: process.env.CNGN_ISSUER_PUBLIC_KEY as string,
        rampProcessorProvider: 'flint',
        licensingStatus: 'UNLICENSED',
        isActive: true,
      },
    });
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  describe('GET /swap/quote', () => {
    it('returns a quote for a valid pair', async () => {
      ctx.stellarService.getStrictSendQuote.mockResolvedValue({
        sourceAmount: '100.0000000',
        destinationAmount: '161900.0000000',
      });

      const res = await request(ctx.app.getHttpServer())
        .get('/swap/quote')
        .query({ fromToken: 'USDC', toToken: 'CNGN', amount: 100 });

      expect(res.status).toBe(200);
      expect(res.body.destinationAmount).toBe('161900.0000000');
      expect(res.body.sourceAsset.code).toBe('USDC');
    });

    it('rejects the same token on both sides', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/swap/quote')
        .query({ fromToken: 'USDC', toToken: 'USDC', amount: 100 });
      expect(res.status).toBe(400);
    });

    it('rejects an invalid token symbol', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/swap/quote')
        .query({ fromToken: 'ETH', toToken: 'CNGN', amount: 100 });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /swap/balance/:token/:address', () => {
    it('rejects a non-Stellar address', async () => {
      const res = await request(ctx.app.getHttpServer()).get('/swap/balance/USDC/not-a-real-address');
      expect(res.status).toBe(400);
    });

    it('returns the balance for a valid Stellar address', async () => {
      ctx.stellarService.getBalance.mockResolvedValue('42.5000000');
      const address = Keypair.random().publicKey();

      const res = await request(ctx.app.getHttpServer()).get(`/swap/balance/USDC/${address}`);

      expect(res.status).toBe(200);
      expect(res.text).toBe('42.5000000');
    });
  });

  describe('GET /swap/trustline/:token/:address', () => {
    it('reports whether a trustline exists', async () => {
      ctx.stellarService.hasTrustline.mockResolvedValue(false);
      const address = Keypair.random().publicKey();

      const res = await request(ctx.app.getHttpServer()).get(`/swap/trustline/CNGN/${address}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ hasTrustline: false });
    });
  });

  describe('POST /swap/trustline/:token/:address/sponsor', () => {
    it('requires authentication', async () => {
      const res = await request(ctx.app.getHttpServer()).post(
        `/swap/trustline/CNGN/${Keypair.random().publicKey()}/sponsor`,
      );
      expect(res.status).toBe(401);
    });

    it('rejects an invalid token', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post(`/swap/trustline/ETH/${Keypair.random().publicKey()}/sponsor`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(400);
    });

    it('returns the sponsor-partially-signed transaction for the user to sign', async () => {
      ctx.stellarService.buildSponsoredTrustlineTransaction.mockResolvedValue({
        xdr: 'AAAAAGZhaw==',
        networkPassphrase: 'Test SDF Network ; September 2015',
      });
      const address = Keypair.random().publicKey();

      const res = await request(ctx.app.getHttpServer())
        .post(`/swap/trustline/CNGN/${address}/sponsor`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(201);
      expect(res.body.xdr).toBe('AAAAAGZhaw==');
      expect(ctx.stellarService.buildSponsoredTrustlineTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ userPublicKey: address }),
      );
    });
  });

  describe('POST /swap/initialize', () => {
    const validBody = {
      amount: 161900,
      fromAmount: 100,
      slippage: 0.05,
      offrampDestination: { bankCode: '058', accountNumber: '1234567890' },
    };

    // Shared Flint mocks — every /swap/initialize call below reaches the
    // same offramp-creation HTTP calls the existing test already mocks.
    const mockFlintOfframp = () => {
      ctx.httpService.get.mockReturnValue(of({ data: { data: { accountName: 'JOHN DOE' } } }));
      ctx.httpService.post.mockReturnValue(
        of({ data: { data: { transactionId: `flint-init-${Date.now()}`, depositAccount: {} } } }),
      );
    };

    it('requires authentication', async () => {
      const res = await request(ctx.app.getHttpServer()).post('/swap/initialize').send(validBody);
      expect(res.status).toBe(401);
    });

    it('rejects a request body with unknown extra fields (whitelist/forbidNonWhitelisted)', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/swap/initialize')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...validBody, notAField: 'x' });
      expect(res.status).toBe(400);
    });

    it('rejects amounts below the 100 NGN minimum', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/swap/initialize')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...validBody, amount: 50 });
      expect(res.status).toBe(400);
    });

    it('opens an offramp (real Flint call mocked) and returns Stellar swapParams end-to-end', async () => {
      // offRamp validates the destination account (a safe, non-money-moving
      // call) before creating the PENDING record — Flint's resolveAccount
      // hits this GET endpoint.
      ctx.httpService.get.mockReturnValue(of({ data: { data: { accountName: 'JOHN DOE' } } }));
      ctx.httpService.post.mockReturnValue(
        of({ data: { data: { transactionId: 'flint-init-1', depositAccount: {} } } }),
      );

      const res = await request(ctx.app.getHttpServer())
        .post('/swap/initialize')
        .set('Authorization', `Bearer ${token}`)
        .send(validBody);

      expect(res.status).toBe(201);
      expect(res.body.recipientAddress).toEqual(expect.stringMatching(/^G/));
      expect(res.body.swapParams.memo).toEqual(expect.stringMatching(/^txn_ref_/));
      expect(res.body.swapParams.sendAsset).toEqual({
        code: 'USDC',
        issuer: process.env.USDC_ISSUER_PUBLIC_KEY,
      });

      // The offramp record this created should be persisted for real, and
      // linked to the swap it created — verified by reading it straight
      // back out of the real (pglite) database.
      const swap = await (ctx.prisma as any).swapTransaction.findUnique({
        where: { reference: res.body.swap.reference },
      });
      expect(swap).not.toBeNull();
      expect(swap.userId).toBe(userId);
      expect(swap.memo).toEqual(expect.stringMatching(/^txn_ref_/));
    });

    it('sells a hub asset (XLM) with no $100 floor, into a non-default corridor (CGHS)', async () => {
      mockFlintOfframp();

      const res = await request(ctx.app.getHttpServer())
        .post('/swap/initialize')
        .set('Authorization', `Bearer ${token}`)
        .send({
          amount: 500,
          fromAmount: 10, // well under 100 — fine, XLM is a hub asset
          fromTokenType: 'XLM',
          slippage: 0.05,
          currency: 'GHS',
          offrampDestination: { bankCode: '058', accountNumber: '1234567890' },
        });

      expect(res.status).toBe(201);
      expect(res.body.swapParams.sendAsset).toEqual({ code: 'XLM', issuer: undefined });
      expect(res.body.swapParams.destAsset.code).toBe('CGHS');

      const swap = await (ctx.prisma as any).swapTransaction.findUnique({
        where: { reference: res.body.swap.reference },
      });
      expect(swap.fromTokenType).toBe('XLM');
      expect(swap.toTokenType).toBe('CGHS');
    });

    it('rejects selling a corridor stablecoin for its own fiat via the swap route', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/swap/initialize')
        .set('Authorization', `Bearer ${token}`)
        .send({
          amount: 500,
          fromAmount: 500,
          fromTokenType: 'CNGN',
          slippage: 0.05,
          currency: 'NGN', // CNGN is NGN's own corridor stablecoin
          offrampDestination: { bankCode: '058', accountNumber: '1234567890' },
        });
      expect(res.status).toBe(400);
    });

    it('rejects amounts below 100 for a non-hub fromTokenType', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/swap/initialize')
        .set('Authorization', `Bearer ${token}`)
        .send({
          amount: 500,
          fromAmount: 50, // CGHS is not a hub asset — floor applies
          fromTokenType: 'CGHS',
          slippage: 0.05,
          currency: 'NGN',
          offrampDestination: { bankCode: '058', accountNumber: '1234567890' },
        });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /swap/create', () => {
    it('requires authentication', async () => {
      const res = await request(ctx.app.getHttpServer()).post('/swap/create').send({});
      expect(res.status).toBe(401);
    });

    it('rejects a Stellar destination address that fails the format check', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/swap/create')
        .set('Authorization', `Bearer ${token}`)
        .send({
          fromTokenType: 'USDC',
          toTokenType: 'CNGN',
          fromAmount: 100,
          toAmount: 161900,
          exchangeRate: 1619,
          sourceAddress: '0xNotStellar',
          destinationAddress: '0xNotStellar',
        });
      expect(res.status).toBe(400);
    });

    it('creates a pending simple-swap record', async () => {
      const addr = Keypair.random().publicKey();
      const res = await request(ctx.app.getHttpServer())
        .post('/swap/create')
        .set('Authorization', `Bearer ${token}`)
        .send({
          fromTokenType: 'USDC',
          toTokenType: 'CNGN',
          fromAmount: 100,
          toAmount: 161900,
          exchangeRate: 1619,
          sourceAddress: addr,
          destinationAddress: addr,
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('PENDING');
      expect(res.body.network).toBe('stellar');
    });
  });

  describe('POST /swap/:reference/complete', () => {
    it('rejects a malformed transaction hash', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/swap/txn_ref_whatever/complete')
        .set('Authorization', `Bearer ${token}`)
        .send({ transactionHash: 'not-hex', sourceAddress: Keypair.random().publicKey() });
      expect(res.status).toBe(400);
    });

    it('verifies on-chain and moves a plain swap straight to COMPLETED', async () => {
      const addr = Keypair.random().publicKey();
      const createRes = await request(ctx.app.getHttpServer())
        .post('/swap/create')
        .set('Authorization', `Bearer ${token}`)
        .send({
          fromTokenType: 'USDC',
          toTokenType: 'CNGN',
          fromAmount: 100,
          toAmount: 161900,
          exchangeRate: 1619,
          sourceAddress: addr,
          destinationAddress: addr,
        });
      const reference = createRes.body.reference;

      ctx.stellarService.getTransactionByHash.mockResolvedValue({ successful: true });

      const res = await request(ctx.app.getHttpServer())
        .post(`/swap/${reference}/complete`)
        .set('Authorization', `Bearer ${token}`)
        .send({ transactionHash: 'a'.repeat(64), sourceAddress: addr });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('COMPLETED');
    });
  });
});
