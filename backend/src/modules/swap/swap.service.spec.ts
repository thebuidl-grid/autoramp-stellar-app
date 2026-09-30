import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { BadRequestException } from '@nestjs/common';
import { of } from 'rxjs';
import { Keypair } from '@stellar/stellar-sdk';
import { SwapService } from './swap.service';
import { PrismaService } from '../../database/prisma.service';
import { StablestackService } from '../stablestack/stablestack.service';
import { StellarService } from '../stellar/stellar.service';
import { CorridorService } from '../corridor/corridor.service';

const cngnIssuer = Keypair.random().publicKey();
const usdcIssuer = Keypair.random().publicKey();
const bridgeUsdcIssuer = Keypair.random().publicKey();
process.env.CNGN_ISSUER_PUBLIC_KEY = cngnIssuer;
process.env.USDC_ISSUER_PUBLIC_KEY = usdcIssuer;
process.env.BRIDGE_USDC_ISSUER_PUBLIC_KEY = bridgeUsdcIssuer;

const ngnCorridor = {
  id: 'corridor-ng',
  countryCode: 'NG',
  fiatCurrency: 'NGN',
  stablecoinCode: 'CNGN',
  stablecoinIssuer: cngnIssuer,
  rampProcessorProvider: 'flint',
  isActive: true,
};

describe('SwapService', () => {
  let service: SwapService;
  let prisma: {
    swapTransaction: { create: jest.Mock; update: jest.Mock; findUnique: jest.Mock };
    offrampTransaction: { update: jest.Mock; findFirst: jest.Mock };
    transactionLog: { create: jest.Mock };
  };
  let stablestackService: { offRamp: jest.Mock };
  let stellarService: {
    getStrictSendQuote: jest.Mock;
    hasTrustline: jest.Mock;
    getBalance: jest.Mock;
    getBalances: jest.Mock;
    getTransactionByHash: jest.Mock;
    buildSponsoredTrustlineTransaction: jest.Mock;
  };
  let httpService: { get: jest.Mock };
  let configService: { get: jest.Mock };
  let corridorService: { findByStablecoinCode: jest.Mock; findByCurrency: jest.Mock; findAll: jest.Mock };

  beforeEach(async () => {
    prisma = {
      swapTransaction: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
      offrampTransaction: { update: jest.fn(), findFirst: jest.fn() },
      transactionLog: { create: jest.fn() },
    };
    stablestackService = { offRamp: jest.fn() };
    stellarService = {
      getStrictSendQuote: jest.fn(),
      hasTrustline: jest.fn(),
      getBalance: jest.fn(),
      getBalances: jest.fn(),
      getTransactionByHash: jest.fn(),
      buildSponsoredTrustlineTransaction: jest.fn(),
    };
    httpService = { get: jest.fn() };
    configService = { get: jest.fn().mockReturnValue('fake-monierate-key') };
    corridorService = {
      findByStablecoinCode: jest.fn().mockResolvedValue(ngnCorridor),
      findByCurrency: jest.fn().mockResolvedValue(ngnCorridor),
      findAll: jest.fn().mockResolvedValue([ngnCorridor]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SwapService,
        { provide: PrismaService, useValue: prisma },
        { provide: StablestackService, useValue: stablestackService },
        { provide: StellarService, useValue: stellarService },
        { provide: HttpService, useValue: httpService },
        { provide: ConfigService, useValue: configService },
        { provide: CorridorService, useValue: corridorService },
      ],
    }).compile();

    service = module.get<SwapService>(SwapService);
  });

  describe('getSwapQuote', () => {
    it('returns amounts, exchange rate, and asset info from StellarService', async () => {
      stellarService.getStrictSendQuote.mockResolvedValue({
        sourceAmount: '100.0000000',
        destinationAmount: '161900.0000000',
      });

      const result = await service.getSwapQuote('USDC', 'CNGN', 100);

      expect(result.sourceAmount).toBe('100.0000000');
      expect(result.destinationAmount).toBe('161900.0000000');
      expect(result.exchangeRate).toBeCloseTo(1619, 0);
      expect(result.sourceAsset).toEqual({ code: 'USDC', issuer: usdcIssuer });
      expect(result.destAsset).toEqual({ code: 'CNGN', issuer: cngnIssuer });
    });

    it('wraps StellarService errors', async () => {
      stellarService.getStrictSendQuote.mockRejectedValue(new Error('no path'));
      await expect(service.getSwapQuote('USDC', 'CNGN', 100)).rejects.toThrow(BadRequestException);
    });

    it('resolves XLM to native (no issuer) and BRIDGE_USDC to the distinct bridge issuer', async () => {
      stellarService.getStrictSendQuote.mockResolvedValue({
        sourceAmount: '1000.0000000',
        destinationAmount: '177.3147041',
      });

      const result = await service.getSwapQuote('XLM', 'BRIDGE_USDC', 1000);

      expect(result.sourceAsset).toEqual({ code: 'XLM', issuer: undefined });
      expect(result.destAsset).toEqual({ code: 'USDC', issuer: bridgeUsdcIssuer });
      // Distinct from the app's own self-issued USDC hub asset.
      expect(result.destAsset.issuer).not.toBe(usdcIssuer);
    });
  });

  describe('getSponsoredTrustlineTransaction', () => {
    it('resolves the token to an asset and delegates to StellarService', async () => {
      stellarService.buildSponsoredTrustlineTransaction.mockResolvedValue({
        xdr: 'AAAA...',
        networkPassphrase: 'Test SDF Network ; September 2015',
      });

      const result = await service.getSponsoredTrustlineTransaction('CNGN', 'GADDRESS');

      expect(stellarService.buildSponsoredTrustlineTransaction).toHaveBeenCalledWith({
        userPublicKey: 'GADDRESS',
        asset: expect.objectContaining({ code: 'CNGN' }),
      });
      expect(result.xdr).toBe('AAAA...');
    });
  });

  describe('getTokenBalances', () => {
    it('requests balances for CNGN, USDC, XLM, and BRIDGE_USDC assets', async () => {
      stellarService.getBalances.mockResolvedValue({ cngn: '100', usdc: '50', xlm: '10', bridge_usdc: '5' });
      const result = await service.getTokenBalances('GADDRESS');

      expect(result).toEqual({ cngn: '100', usdc: '50', xlm: '10', bridge_usdc: '5' });
      const [, assets] = stellarService.getBalances.mock.calls[0];
      expect(assets.cngn.getIssuer()).toBe(cngnIssuer);
      expect(assets.usdc.getIssuer()).toBe(usdcIssuer);
      expect(assets.xlm.isNative()).toBe(true);
      expect(assets.bridge_usdc.getIssuer()).toBe(bridgeUsdcIssuer);
    });

    it('omits bridge_usdc when BRIDGE_USDC_ISSUER_PUBLIC_KEY is not configured', async () => {
      delete process.env.BRIDGE_USDC_ISSUER_PUBLIC_KEY;
      try {
        stellarService.getBalances.mockResolvedValue({ cngn: '100', usdc: '50', xlm: '10' });
        await service.getTokenBalances('GADDRESS');

        const [, assets] = stellarService.getBalances.mock.calls[0];
        expect(assets.bridge_usdc).toBeUndefined();
      } finally {
        process.env.BRIDGE_USDC_ISSUER_PUBLIC_KEY = bridgeUsdcIssuer;
      }
    });
  });

  describe('getUsdNgnRate', () => {
    it('fetches and caches the rate from MonieRate', async () => {
      httpService.get.mockReturnValue(of({ data: { data: { rates: { NGN: 1619.01 } } } }));

      const first = await service.getUsdNgnRate();
      const second = await service.getUsdNgnRate();

      expect(first).toBe(1619.01);
      expect(second).toBe(1619.01);
      // Second call should be served from cache, not a second HTTP request
      expect(httpService.get).toHaveBeenCalledTimes(1);
    });

    it('throws when MonieRate returns an invalid rate', async () => {
      httpService.get.mockReturnValue(of({ data: { data: { rates: { NGN: 0 } } } }));
      await expect(service.getUsdNgnRate()).rejects.toThrow(BadRequestException);
    });
  });

  describe('initializeSwap', () => {
    const dto = {
      amount: 161900,
      fromAmount: 100,
      slippage: 0.05,
      offrampDestination: { bankCode: '058', accountNumber: '1234567890' },
    };

    it('opens an offramp first, then creates a linked swap record with Stellar swapParams', async () => {
      const collectionAddress = Keypair.random().publicKey();
      stablestackService.offRamp.mockResolvedValue({
        databaseRecord: { id: 'offramp-1', reference: 'txn_ref_abc', status: 'PENDING' },
        data: { depositAddress: collectionAddress, memo: 'txn_ref_abc' },
      });
      prisma.swapTransaction.create.mockResolvedValue({
        id: 'swap-1',
        reference: 'txn_ref_abc',
        fromAmount: 100,
        toAmount: 161900,
        exchangeRate: 1619,
        status: 'PENDING',
        createdAt: new Date('2026-01-01'),
      });
      prisma.offrampTransaction.update.mockResolvedValue({});
      prisma.transactionLog.create.mockResolvedValue({});

      const result = await service.initializeSwap('user-1', dto as any);

      expect(stablestackService.offRamp).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ network: 'stellar', amount: dto.amount }),
        undefined,
        undefined,
      );
      expect(prisma.swapTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            reference: 'txn_ref_abc',
            memo: 'txn_ref_abc',
            destinationAddress: collectionAddress,
          }),
        }),
      );
      expect(prisma.offrampTransaction.update).toHaveBeenCalledWith({
        where: { id: 'offramp-1' },
        data: { swapId: 'swap-1' },
      });
      expect(result.recipientAddress).toBe(collectionAddress);
      expect(result.swapParams).toEqual({
        sendAsset: { code: 'USDC', issuer: usdcIssuer },
        sendAmount: '100',
        destAsset: { code: 'CNGN', issuer: cngnIssuer },
        destMin: (161900 * 0.95).toFixed(7),
        destination: collectionAddress,
        memo: 'txn_ref_abc',
        slippage: 0.05,
      });
    });

    it('fails clearly if the offramp response has no deposit address/memo', async () => {
      stablestackService.offRamp.mockResolvedValue({
        databaseRecord: { id: 'offramp-1', reference: 'txn_ref_abc' },
        data: {},
      });

      await expect(service.initializeSwap('user-1', dto as any)).rejects.toThrow(
        'Recipient address/memo not found',
      );
      expect(prisma.swapTransaction.create).not.toHaveBeenCalled();
    });
  });

  describe('updateSwapAfterExecution', () => {
    it('moves to PROCESSING when the swap is linked to an offramp', async () => {
      prisma.swapTransaction.findUnique.mockResolvedValue({
        id: 'swap-1',
        status: 'PENDING',
        userId: 'user-1',
      });
      stellarService.getTransactionByHash.mockResolvedValue({ successful: true });
      prisma.offrampTransaction.findFirst.mockResolvedValue({ id: 'offramp-1' });
      prisma.swapTransaction.update.mockResolvedValue({ status: 'PROCESSING' });

      const result = await service.updateSwapAfterExecution(
        'txn_ref_abc',
        'a'.repeat(64),
        Keypair.random().publicKey(),
      );

      expect(prisma.swapTransaction.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'PROCESSING', completedAt: null }) }),
      );
      expect(result.status).toBe('PROCESSING');
    });

    it('moves straight to COMPLETED for a plain swap with no linked offramp', async () => {
      prisma.swapTransaction.findUnique.mockResolvedValue({
        id: 'swap-1',
        status: 'PENDING',
        userId: 'user-1',
      });
      stellarService.getTransactionByHash.mockResolvedValue({ successful: true });
      prisma.offrampTransaction.findFirst.mockResolvedValue(null);
      prisma.swapTransaction.update.mockResolvedValue({ status: 'COMPLETED' });

      await service.updateSwapAfterExecution('txn_ref_abc', 'a'.repeat(64), Keypair.random().publicKey());

      expect(prisma.swapTransaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'COMPLETED', completedAt: expect.any(Date) }),
        }),
      );
    });

    it('rejects if the reported transaction failed on-chain', async () => {
      prisma.swapTransaction.findUnique.mockResolvedValue({ id: 'swap-1', status: 'PENDING' });
      stellarService.getTransactionByHash.mockResolvedValue({ successful: false });

      await expect(
        service.updateSwapAfterExecution('txn_ref_abc', 'a'.repeat(64), Keypair.random().publicKey()),
      ).rejects.toThrow('not successful on-chain');
      expect(prisma.swapTransaction.update).not.toHaveBeenCalled();
    });

    it('rejects if the swap is not found', async () => {
      prisma.swapTransaction.findUnique.mockResolvedValue(null);
      await expect(
        service.updateSwapAfterExecution('missing', 'a'.repeat(64), Keypair.random().publicKey()),
      ).rejects.toThrow('Swap transaction not found');
    });

    it('rejects if the swap has already moved past PENDING', async () => {
      prisma.swapTransaction.findUnique.mockResolvedValue({ id: 'swap-1', status: 'COMPLETED' });
      await expect(
        service.updateSwapAfterExecution('txn_ref_abc', 'a'.repeat(64), Keypair.random().publicKey()),
      ).rejects.toThrow('already COMPLETED');
    });
  });

  describe('createSimpleSwap', () => {
    const addr = Keypair.random().publicKey();

    it('rejects swapping a token into itself', async () => {
      await expect(
        service.createSimpleSwap('user-1', {
          fromTokenType: 'USDC',
          toTokenType: 'USDC',
          fromAmount: 100,
          toAmount: 100,
          exchangeRate: 1,
          sourceAddress: addr,
          destinationAddress: addr,
        } as any),
      ).rejects.toThrow('must be different');
    });

    it('enforces the 100 CNGN minimum for CNGN -> USDC', async () => {
      await expect(
        service.createSimpleSwap('user-1', {
          fromTokenType: 'CNGN',
          toTokenType: 'USDC',
          fromAmount: 50,
          toAmount: 0.03,
          exchangeRate: 0.0006,
          sourceAddress: addr,
          destinationAddress: addr,
        } as any),
      ).rejects.toThrow('Minimum amount for CNGN to USDC swap is 100');
    });

    it('allows an XLM <-> BRIDGE_USDC swap under 100 units on both legs (no corridor minimum)', async () => {
      prisma.swapTransaction.create.mockResolvedValue({
        id: 'swap-3',
        reference: 'txn_ref_xlm',
        fromTokenType: 'XLM',
        toTokenType: 'BRIDGE_USDC',
        sourceAddress: addr,
        destinationAddress: addr,
        status: 'PENDING',
        fromNetwork: 'stellar',
        createdAt: new Date('2026-01-01'),
      });
      prisma.transactionLog.create.mockResolvedValue({});

      const result = await service.createSimpleSwap('user-1', {
        fromTokenType: 'XLM',
        toTokenType: 'BRIDGE_USDC',
        fromAmount: 10,
        toAmount: 1.77,
        exchangeRate: 0.177,
        sourceAddress: addr,
        destinationAddress: addr,
      } as any);

      expect(result.status).toBe('PENDING');
    });

    it('creates a PENDING swap record on success', async () => {
      prisma.swapTransaction.create.mockResolvedValue({
        id: 'swap-2',
        reference: 'txn_ref_xyz',
        fromTokenType: 'USDC',
        toTokenType: 'CNGN',
        sourceAddress: addr,
        destinationAddress: addr,
        status: 'PENDING',
        fromNetwork: 'stellar',
        createdAt: new Date('2026-01-01'),
      });
      prisma.transactionLog.create.mockResolvedValue({});

      const result = await service.createSimpleSwap('user-1', {
        fromTokenType: 'USDC',
        toTokenType: 'CNGN',
        fromAmount: 100,
        toAmount: 161900,
        exchangeRate: 1619,
        sourceAddress: addr,
        destinationAddress: addr,
      } as any);

      expect(prisma.swapTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ fromNetwork: 'stellar', toNetwork: 'stellar', status: 'PENDING' }),
        }),
      );
      expect(result.status).toBe('PENDING');
      expect(result.network).toBe('stellar');
    });
  });
});
