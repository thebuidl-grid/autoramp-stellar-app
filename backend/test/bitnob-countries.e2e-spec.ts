import { Test } from '@nestjs/testing';
import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { MiscController } from '../src/modules/misc/misc.controller';
import { RatesController } from '../src/modules/rates/rates.controller';
import { RampController } from '../src/modules/ramp/ramp.controller';
import { RampService } from '../src/modules/ramp/ramp.service';
import { BitNobService } from '../src/modules/bitnob/bitnob.service';
import { ChainRateService } from '../src/modules/rates/chain-rate.service';
import { ApiLoggingInterceptor } from '../src/common/interceptors/api-logging.interceptor';
import { AuthOrApiKeyGuard } from '../src/common/guards/auth-or-api-key.guard';

/**
 * HTTP-level e2e for the multi-country (NG/GH/KE) Bitnob corridor.
 * External providers are mocked; controllers, guards, pipes and DTO
 * validation run for real, so no DB/Redis/Bitnob access is needed.
 */
describe('Bitnob countries (e2e)', () => {
  let app: INestApplication<App>;
  const bitnob = {
    listBanks: jest.fn(),
    createPayoutQuote: jest.fn(),
  };
  const ramp = {
    getBanks: jest
      .fn()
      .mockResolvedValue({ status: 'success', data: ['flint'] }),
    resolveAccount: jest.fn().mockResolvedValue({ status: 'success' }),
    onRamp: jest.fn().mockResolvedValue({ status: 'success' }),
    offRamp: jest.fn().mockResolvedValue({ status: 'success' }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [MiscController, RatesController, RampController],
      providers: [
        { provide: RampService, useValue: ramp },
        { provide: BitNobService, useValue: bitnob },
        ChainRateService,
      ],
    })
      .overrideGuard(AuthOrApiKeyGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          ctx.switchToHttp().getRequest().user = { id: 'u1', email: 'a@b.c' };
          return true;
        },
      })
      .overrideInterceptor(ApiLoggingInterceptor)
      .useValue({ intercept: (_c: any, next: any) => next.handle() })
      .compile();

    app = moduleRef.createNestApplication();
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
  beforeEach(() => jest.clearAllMocks());

  it('GET /misc/countries lists NG, GH and KE', async () => {
    const res = await request(app.getHttpServer())
      .get('/misc/countries')
      .expect(200);
    expect(res.body.data.map((c: any) => [c.code, c.currency])).toEqual([
      ['NG', 'NGN'],
      ['GH', 'GHS'],
      ['KE', 'KES'],
    ]);
  });

  it('GET /misc/banks?country=GH is served by Bitnob', async () => {
    bitnob.listBanks.mockResolvedValue([{ code: 'GCB', name: 'GCB Bank' }]);
    const res = await request(app.getHttpServer())
      .get('/misc/banks?country=GH')
      .expect(200);
    expect(bitnob.listBanks).toHaveBeenCalledWith('GH');
    expect(res.body.data[0].code).toBe('GCB');
    expect(ramp.getBanks).not.toHaveBeenCalled();
  });

  it('GET /misc/banks without country keeps the Nigerian provider', async () => {
    await request(app.getHttpServer()).get('/misc/banks').expect(200);
    expect(ramp.getBanks).toHaveBeenCalled();
    expect(bitnob.listBanks).not.toHaveBeenCalled();
  });

  it('GET /misc/banks?country=US is rejected', async () => {
    await request(app.getHttpServer())
      .get('/misc/banks?country=US')
      .expect(400);
  });

  it('GET /ramp/resolve-account forwards country', async () => {
    await request(app.getHttpServer())
      .get(
        '/ramp/resolve-account?bankCode=1&accountNumber=2&network=stellar&country=KE',
      )
      .expect(200);
    expect(ramp.resolveAccount).toHaveBeenCalledWith('1', '2', 'stellar', 'KE');
  });

  it('GET /rates quotes in the local currency per country', async () => {
    bitnob.createPayoutQuote.mockResolvedValue({ data: { rate: 130 } });
    const res = await request(app.getHttpServer())
      .get('/rates/usd-ngn-rate?network=stellar&country=KE')
      .expect(200);
    expect(res.body).toMatchObject({
      rate: 130,
      country: 'KE',
      currency: 'KES',
    });
    expect(bitnob.createPayoutQuote).toHaveBeenCalledWith(
      expect.objectContaining({ toCurrency: 'KES', country: 'KE' }),
    );
  });

  it('GET /rates rejects unsupported countries', async () => {
    await request(app.getHttpServer())
      .get('/rates/usd-ngn-rate?network=stellar&country=ZZ')
      .expect(400);
  });

  describe('POST /ramp/offramp & /ramp/onramp validation', () => {
    const offramp = {
      network: 'stellar',
      amount: 5000,
      sourceAddress: 'G' + 'A'.repeat(55),
      destination: { bankCode: '1', accountNumber: '2' },
    };
    const onramp = {
      network: 'stellar',
      amount: 5000,
      destination: { address: 'GABC' },
    };

    it.each(['NG', 'GH', 'KE'])(
      'offramp accepts country %s',
      async (country) => {
        await request(app.getHttpServer())
          .post('/ramp/offramp')
          .send({ ...offramp, country })
          .expect(201);
        expect(ramp.offRamp.mock.calls[0][4]).toMatchObject({ country });
      },
    );

    it('onramp accepts GH and omitted country', async () => {
      await request(app.getHttpServer())
        .post('/ramp/onramp')
        .send({ ...onramp, country: 'GH' })
        .expect(201);
      await request(app.getHttpServer())
        .post('/ramp/onramp')
        .send(onramp)
        .expect(201);
    });

    it.each(['/ramp/offramp', '/ramp/onramp'])(
      '%s rejects unsupported country',
      async (url) => {
        const body = url.endsWith('offramp') ? offramp : onramp;
        await request(app.getHttpServer())
          .post(url)
          .send({ ...body, country: 'US' })
          .expect(400);
      },
    );
  });
});
