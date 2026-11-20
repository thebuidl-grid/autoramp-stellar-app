import { Test } from '@nestjs/testing';
import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { UserAnalyticsController } from '../src/modules/user-analytics/user-analytics.controller';
import { UserAnalyticsService } from '../src/modules/user-analytics/user-analytics.service';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt-auth.guard';

describe('User analytics (e2e)', () => {
  let app: INestApplication<App>;
  let role = 'ADMIN';
  const svc = { report: jest.fn().mockResolvedValue({ users: {} }) };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      controllers: [UserAnalyticsController],
      providers: [{ provide: UserAnalyticsService, useValue: svc }],
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

  it('requires a token', async () => {
    await request(app.getHttpServer()).get('/admin/user-analytics').expect(403);
  });

  it('rejects non-admins', async () => {
    role = 'USER';
    await request(app.getHttpServer())
      .get('/admin/user-analytics')
      .set('Authorization', 'Bearer t')
      .expect(403);
    expect(svc.report).not.toHaveBeenCalled();
  });

  it('passes the days range to the service', async () => {
    await request(app.getHttpServer())
      .get('/admin/user-analytics?days=90')
      .set('Authorization', 'Bearer t')
      .expect(200);
    expect(svc.report).toHaveBeenCalledWith(90);
  });

  it.each(['0', '400', 'abc'])('rejects days=%s', async (days) => {
    await request(app.getHttpServer())
      .get(`/admin/user-analytics?days=${days}`)
      .set('Authorization', 'Bearer t')
      .expect(400);
  });
});
