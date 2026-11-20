import { Test } from '@nestjs/testing';
import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { WaitlistController } from '../src/modules/waitlist/waitlist.controller';
import { WaitlistService } from '../src/modules/waitlist/waitlist.service';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt-auth.guard';

describe('Waitlist (e2e)', () => {
  let app: INestApplication<App>;
  let role = 'ADMIN';
  const svc = {
    join: jest.fn().mockResolvedValue({ status: 'success', message: 'ok' }),
    list: jest.fn().mockResolvedValue({ data: [], meta: {} }),
    exportCsv: jest.fn().mockResolvedValue('email,source,signed_up_at_utc\n'),
    stats: jest.fn().mockResolvedValue({ total: 0, series: [] }),
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      controllers: [WaitlistController],
      providers: [{ provide: WaitlistService, useValue: svc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          const req = ctx.switchToHttp().getRequest();
          if (req.headers.authorization !== 'Bearer t') return false;
          req.user = { id: 'u', role };
          return true;
        },
      })
      .compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });
  afterAll(() => app?.close());
  beforeEach(() => {
    jest.clearAllMocks();
    role = 'ADMIN';
  });

  const valid = {
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    phoneNumber: '+2348012345678',
    userType: 'freelancer',
  };

  it('POST /waitlist normalises fields and needs no auth', async () => {
    await request(app.getHttpServer())
      .post('/waitlist')
      .send({
        ...valid,
        name: '  Ada Lovelace  ',
        email: '  Ada@Example.COM ',
        phoneNumber: '+234 (801) 234-5678',
      })
      .expect(200);
    expect(svc.join).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        phoneNumber: '+2348012345678',
        userType: 'freelancer',
      }),
      null,
    );
  });

  it('POST /waitlist accepts and normalises the origin fields', async () => {
    await request(app.getHttpServer())
      .post('/waitlist')
      .set('x-visitor-country', 'gh')
      .send({
        ...valid,
        phoneCountry: 'ng',
        referrer: 'https://www.Twitter.com/post/1',
        utmSource: ' twitter ',
        utmMedium: '   ',
      })
      .expect(200);
    const [dto, country] = svc.join.mock.calls[0];
    expect(country).toBe('GH');
    expect(dto).toMatchObject({
      phoneCountry: 'NG',
      referrer: 'twitter.com',
      utmSource: 'twitter',
    });
    expect(dto.utmMedium).toBeUndefined();
  });

  it('POST /waitlist passes null country when no edge header is present', async () => {
    await request(app.getHttpServer())
      .post('/waitlist')
      .send(valid)
      .expect(200);
    expect(svc.join.mock.calls[0][1]).toBeNull();
  });

  it.each([
    ['bad phone country', { phoneCountry: 'NGA' }],
    ['numeric phone country', { phoneCountry: '12' }],
    ['too-long utm source', { utmSource: 'a'.repeat(101) }],
    ['too-long referrer', { referrer: 'a'.repeat(300) }],
  ])('POST /waitlist rejects %s', async (_l, extra) => {
    await request(app.getHttpServer())
      .post('/waitlist')
      .send({ ...valid, ...extra })
      .expect(400);
  });

  it.each(['crypto_native', 'freelancer', 'cross_border', 'fintech'])(
    'POST /waitlist accepts user type %s',
    async (userType) => {
      await request(app.getHttpServer())
        .post('/waitlist')
        .send({ ...valid, userType })
        .expect(200);
    },
  );

  it.each([
    ['invalid email', { ...valid, email: 'nope' }],
    [
      'missing email',
      { name: 'Ada', phoneNumber: '+2348012345678', userType: 'fintech' },
    ],
    [
      'missing name',
      { email: 'a@b.co', phoneNumber: '+2348012345678', userType: 'fintech' },
    ],
    ['blank name', { ...valid, name: '   ' }],
    ['one-letter name', { ...valid, name: 'A' }],
    [
      'missing user type',
      { name: 'Ada', email: 'a@b.co', phoneNumber: '+2348012345678' },
    ],
    [
      'missing phone number',
      { name: 'Ada', email: 'a@b.co', userType: 'fintech' },
    ],
    ['blank phone number', { ...valid, phoneNumber: '   ' }],
    ['null phone number', { ...valid, phoneNumber: null }],
    ['unknown user type', { ...valid, userType: 'astronaut' }],
    ['too-short phone', { ...valid, phoneNumber: '12345' }],
    ['letters in phone', { ...valid, phoneNumber: '+23480abc4567' }],
    ['unknown field', { ...valid, admin: true }],
    ['empty body', {}],
  ])('POST /waitlist rejects %s', async (_label, body) => {
    await request(app.getHttpServer()).post('/waitlist').send(body).expect(400);
    expect(svc.join).not.toHaveBeenCalled();
  });

  it('admin endpoints require a token', async () => {
    await request(app.getHttpServer()).get('/admin/waitlist').expect(403);
    await request(app.getHttpServer()).get('/admin/waitlist/stats').expect(403);
  });

  it('admin endpoints reject non-admins', async () => {
    role = 'USER';
    await request(app.getHttpServer())
      .get('/admin/waitlist')
      .set('Authorization', 'Bearer t')
      .expect(403);
  });

  it('CSV export is admin-only and served as a download', async () => {
    await request(app.getHttpServer())
      .get('/admin/waitlist/export')
      .expect(403);
    const res = await request(app.getHttpServer())
      .get('/admin/waitlist/export')
      .set('Authorization', 'Bearer t')
      .expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('waitlist.csv');
  });

  it('admins can list and read stats with parsed query params', async () => {
    await request(app.getHttpServer())
      .get('/admin/waitlist?page=2&limit=5&search=ada')
      .set('Authorization', 'Bearer t')
      .expect(200);
    expect(svc.list).toHaveBeenCalledWith(2, 5, 'ada');
    await request(app.getHttpServer())
      .get('/admin/waitlist/stats?days=14')
      .set('Authorization', 'Bearer t')
      .expect(200);
    expect(svc.stats).toHaveBeenCalledWith(14);
    await request(app.getHttpServer())
      .get('/admin/waitlist/stats?days=0')
      .set('Authorization', 'Bearer t')
      .expect(400);
  });
});
