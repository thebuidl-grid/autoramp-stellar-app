import request from 'supertest';
import { createTestApp, TestApp } from './utils/test-app';
import { createTestUser, createTestAdmin, signJwtFor } from './utils/auth-helpers';

describe('Corridor registry (e2e)', () => {
  let ctx: TestApp;
  let adminToken: string;
  let userToken: string;

  beforeAll(async () => {
    ctx = await createTestApp('corridor-e2e');
    const admin = await createTestAdmin(ctx.prisma as any);
    adminToken = signJwtFor({ ...admin, role: 'ADMIN' });
    const user = await createTestUser(ctx.prisma as any, { role: 'USER' });
    userToken = signJwtFor(user);
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  // createTestApp() always seeds a real NG/NGN corridor now (every
  // onramp/offramp/swap call resolves via CorridorService), so this
  // suite's own fixtures use a different country/currency to avoid
  // colliding with it.
  const keCorridor = {
    countryCode: 'KE',
    fiatCurrency: 'KES',
    stablecoinCode: 'CKES',
    stablecoinIssuer: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37',
    rampProcessorProvider: 'flint',
  };

  describe('POST /admin/corridors', () => {
    it('rejects unauthenticated requests', async () => {
      const res = await request(ctx.app.getHttpServer()).post('/admin/corridors').send(keCorridor);
      expect(res.status).toBe(401);
    });

    it('rejects non-admin users', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/admin/corridors')
        .set('Authorization', `Bearer ${userToken}`)
        .send(keCorridor);
      expect(res.status).toBe(403);
    });

    it('creates a corridor for an admin', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/admin/corridors')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(keCorridor);

      expect(res.status).toBe(201);
      expect(res.body.countryCode).toBe('KE');
      expect(res.body.fiatCurrency).toBe('KES');
      expect(res.body.licensingStatus).toBe('UNLICENSED');
      expect(res.body.isActive).toBe(true);
    });

    it('rejects a duplicate country/fiat pair', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/admin/corridors')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(keCorridor);

      expect(res.status).toBe(409);
    });

    it('rejects an invalid Stellar issuer key', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/admin/corridors')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...keCorridor, countryCode: 'TZ', fiatCurrency: 'TZS', stablecoinIssuer: 'not-a-key' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /admin/corridors', () => {
    it('lists corridors for an admin', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/admin/corridors')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.some((c: any) => c.countryCode === 'KE')).toBe(true);
    });
  });

  describe('PATCH /admin/corridors/:id', () => {
    it('updates a corridor', async () => {
      const list = await request(ctx.app.getHttpServer())
        .get('/admin/corridors')
        .set('Authorization', `Bearer ${adminToken}`);
      const target = list.body.find((c: any) => c.countryCode === 'KE');

      const res = await request(ctx.app.getHttpServer())
        .patch(`/admin/corridors/${target.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ licensingStatus: 'PARTNERED' });

      expect(res.status).toBe(200);
      expect(res.body.licensingStatus).toBe('PARTNERED');
    });

    it('returns 404 for a non-existent corridor', async () => {
      const res = await request(ctx.app.getHttpServer())
        .patch('/admin/corridors/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /admin/corridors/:id', () => {
    it('deletes a corridor', async () => {
      const create = await request(ctx.app.getHttpServer())
        .post('/admin/corridors')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...keCorridor, countryCode: 'GH', fiatCurrency: 'GHS' });

      const res = await request(ctx.app.getHttpServer())
        .delete(`/admin/corridors/${create.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);

      const getRes = await request(ctx.app.getHttpServer())
        .get(`/admin/corridors/${create.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(getRes.status).toBe(404);
    });
  });
});
