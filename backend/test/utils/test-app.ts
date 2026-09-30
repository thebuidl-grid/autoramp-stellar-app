import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/database/prisma.service';
import { StellarService } from '../../src/modules/stellar/stellar.service';
import { createTestDatabase } from './pglite-db';

export interface TestApp {
  app: INestApplication;
  prisma: PrismaService;
  stellarService: {
    getStrictSendQuote: jest.Mock;
    hasTrustline: jest.Mock;
    getBalance: jest.Mock;
    getBalances: jest.Mock;
    getTransactionByHash: jest.Mock;
    findIncomingPaymentByMemo: jest.Mock;
    sendFromDistribution: jest.Mock;
    buildSponsoredTrustlineTransaction: jest.Mock;
    mintCctpTransfer: jest.Mock;
    swapFromDistribution: jest.Mock;
    executeCctpBurnFromDistribution: jest.Mock;
  };
  httpService: { get: jest.Mock; post: jest.Mock };
  cleanup: () => Promise<void>;
}

/**
 * Boots the real Nest HTTP app (real routing, guards, DTO validation —
 * same ValidationPipe config as main.ts) against a real file-based
 * Postgres-compatible database (PGlite). Only genuinely external network
 * dependencies are mocked: Stellar Horizon (StellarService) and Flint's
 * HTTP API (HttpService, used directly by StablestackService).
 */
export async function createTestApp(suiteName: string): Promise<TestApp> {
  // Required env vars are set in test/jest.env.setup.js (a Jest `setupFiles`
  // entry), which runs before any test file's imports — including the
  // static `import { AppModule }` below, whose ConfigModule.forRoot() Joi
  // validation runs as a module-decorator side effect at import time.
  const { prisma: pgliteClient, cleanup: cleanupDb } = await createTestDatabase(suiteName);

  // Every onramp/offramp/swap call now resolves its asset/processor via
  // CorridorService, so every suite needs a real NG/NGN corridor row —
  // there's no more env-var-only path. Matches the module's own default
  // fallback ('flint' when RAMP_PROCESSOR_PROVIDER is unset) so existing
  // Flint-mocked tests keep working unmodified; a suite that sets
  // RAMP_PROCESSOR_PROVIDER before calling createTestApp (e.g.
  // safehaven.e2e-spec.ts) gets a corridor pointing at that provider instead.
  await pgliteClient.corridor.create({
    data: {
      countryCode: 'NG',
      fiatCurrency: 'NGN',
      stablecoinCode: 'CNGN',
      stablecoinIssuer: process.env.CNGN_ISSUER_PUBLIC_KEY as string,
      rampProcessorProvider: process.env.RAMP_PROCESSOR_PROVIDER || 'flint',
      licensingStatus: 'PARTNERED',
      isActive: true,
    },
  });

  // Same reasoning as the corridor seed above — the bridge module's
  // Stellar-side lookups (ChainRegistryService.findByName('stellar'))
  // need a real row, so every suite gets one rather than each bridge
  // test file having to remember to seed it.
  await pgliteClient.chain.create({
    data: {
      name: 'stellar',
      chainType: 'STELLAR',
      cctpDomain: 27,
      usdcAddress: process.env.USDC_ISSUER_PUBLIC_KEY as string,
      cctpForwarderAddress: 'CA66Q2WFBND6V4UEB7RD4SAXSVIWMD6RA4X3U32ELVFGXV5PJK4T4VSZ',
      isActive: true,
    },
  });

  const stellarService = {
    getStrictSendQuote: jest.fn(),
    hasTrustline: jest.fn(),
    getBalance: jest.fn(),
    getBalances: jest.fn(),
    getTransactionByHash: jest.fn(),
    findIncomingPaymentByMemo: jest.fn(),
    sendFromDistribution: jest.fn(),
    buildSponsoredTrustlineTransaction: jest.fn(),
    mintCctpTransfer: jest.fn(),
    swapFromDistribution: jest.fn(),
    executeCctpBurnFromDistribution: jest.fn(),
  };
  const httpService = { get: jest.fn(), post: jest.fn() };

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useValue(pgliteClient)
    .overrideProvider(StellarService)
    .useValue(stellarService)
    .overrideProvider(HttpService)
    .useValue(httpService)
    .compile();

  // rawBody: true mirrors main.ts — needed so the Paystack webhook route
  // can verify the HMAC signature over the exact bytes received.
  const app = moduleRef.createNestApplication({ rawBody: true });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  await app.init();

  return {
    app,
    prisma: pgliteClient as unknown as PrismaService,
    stellarService,
    httpService,
    cleanup: async () => {
      await app.close();
      await cleanupDb();
    },
  };
}
