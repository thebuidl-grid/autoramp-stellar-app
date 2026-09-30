import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Keypair } from '@stellar/stellar-sdk';
import { StablestackService } from './stablestack.service';
import { PrismaService } from '../../database/prisma.service';
import { StellarService } from '../stellar/stellar.service';
import { RampProcessor } from './ramp-processor.interface';
import { RampProcessorRegistry } from './ramp-processor.registry';
import { CorridorService } from '../corridor/corridor.service';
import { ChainRegistryService } from '../bridge/chain-registry.service';
import { ChainTokenRegistryService } from '../bridge/chain-token-registry.service';

const cngnIssuer = Keypair.random().publicKey();
process.env.CNGN_ISSUER_PUBLIC_KEY = cngnIssuer;
process.env.USDC_ISSUER_PUBLIC_KEY = Keypair.random().publicKey();

const ngnCorridor = {
  id: 'corridor-ng',
  countryCode: 'NG',
  fiatCurrency: 'NGN',
  stablecoinCode: 'CNGN',
  stablecoinIssuer: cngnIssuer,
  rampProcessorProvider: 'flint',
  isActive: true,
};

function offrampFixture(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 'offramp-1',
    reference: 'txn_ref_y',
    status: 'PENDING',
    memo: 'txn_ref_y',
    userId: 'user-1',
    tokenType: 'CNGN',
    currency: 'NGN',
    amount: '10000',
    bankCode: '058',
    accountNumber: '1234567890',
    ...overrides,
  };
}

describe('StablestackService', () => {
  let service: StablestackService;
  let prisma: {
    user: { findUnique: jest.Mock };
    onrampTransaction: { create: jest.Mock; count: jest.Mock; findMany: jest.Mock };
    offrampTransaction: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      count: jest.Mock;
      findMany: jest.Mock;
    };
    swapTransaction: { count: jest.Mock; findMany: jest.Mock };
    transactionLog: { create: jest.Mock };
  };
  let stellarService: { getTransactionByHash: jest.Mock; findIncomingPaymentByMemo: jest.Mock };
  let rampProcessor: jest.Mocked<RampProcessor>;
  let rampProcessorRegistry: { get: jest.Mock };
  let corridorService: { findByCurrency: jest.Mock; findByStablecoinCode: jest.Mock };
  let chainRegistry: { findByName: jest.Mock };
  let chainTokenRegistry: { findByCode: jest.Mock };
  let configValues: Record<string, string>;
  const distributionPublicKey = Keypair.random().publicKey();

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ email: 'user@example.com' }) },
      onrampTransaction: { create: jest.fn(), count: jest.fn(), findMany: jest.fn() },
      offrampTransaction: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn(),
        findMany: jest.fn(),
      },
      swapTransaction: { count: jest.fn(), findMany: jest.fn() },
      transactionLog: { create: jest.fn() },
    };
    stellarService = { getTransactionByHash: jest.fn(), findIncomingPaymentByMemo: jest.fn() };
    rampProcessor = {
      getBanks: jest.fn(),
      resolveAccount: jest.fn().mockResolvedValue({ data: { accountName: 'JOHN DOE' } }),
      initiateOnramp: jest.fn(),
      executeOfframpPayout: jest.fn().mockResolvedValue({
        providerTransactionId: 'payout-1',
        depositAccount: null,
        raw: {},
      }),
    };
    rampProcessorRegistry = { get: jest.fn().mockReturnValue(rampProcessor) };
    corridorService = {
      findByCurrency: jest.fn().mockResolvedValue(ngnCorridor),
      findByStablecoinCode: jest.fn().mockResolvedValue(ngnCorridor),
    };
    chainRegistry = { findByName: jest.fn().mockResolvedValue({ name: 'stellar', chainType: 'STELLAR' }) };
    chainTokenRegistry = { findByCode: jest.fn() };
    configValues = {
      STELLAR_DISTRIBUTION_PUBLIC_KEY: distributionPublicKey,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StablestackService,
        { provide: PrismaService, useValue: prisma },
        { provide: StellarService, useValue: stellarService },
        { provide: RampProcessorRegistry, useValue: rampProcessorRegistry },
        { provide: CorridorService, useValue: corridorService },
        { provide: ChainRegistryService, useValue: chainRegistry },
        { provide: ChainTokenRegistryService, useValue: chainTokenRegistry },
        {
          provide: ConfigService,
          useValue: { get: jest.fn((key: string) => configValues[key]) },
        },
      ],
    }).compile();

    service = module.get<StablestackService>(StablestackService);
  });

  describe('onRamp', () => {
    it('creates an onramp transaction record on the stellar network via the injected processor', async () => {
      const destination = Keypair.random().publicKey();
      rampProcessor.initiateOnramp.mockResolvedValue({
        providerTransactionId: 'flint-tx-1',
        depositAccount: { bankName: 'Providus', accountNumber: '123', accountName: 'AutoRamp' },
        raw: { status: 'success' },
      });
      prisma.onrampTransaction.create.mockResolvedValue({
        id: 'onramp-1',
        reference: 'txn_ref_x',
        status: 'PENDING',
        createdAt: new Date('2026-01-01'),
      });
      prisma.transactionLog.create.mockResolvedValue({});

      const result = await service.onRamp('user-1', {
        network: 'stellar',
        amount: 10000,
        destination: { address: destination },
      } as any);

      expect(rampProcessor.initiateOnramp).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 10000, destinationAddress: destination }),
      );
      expect(prisma.onrampTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            network: 'stellar',
            destinationAddress: destination,
            flintTransactionId: 'flint-tx-1',
          }),
        }),
      );
      expect(result.databaseRecord.reference).toBe('txn_ref_x');
      expect(result.status).toBe('success'); // spread from raw processor response
    });

    it('propagates processor errors without swallowing them', async () => {
      rampProcessor.initiateOnramp.mockRejectedValue(new Error('processor down'));

      await expect(
        service.onRamp('user-1', {
          network: 'stellar',
          amount: 10000,
          destination: { address: Keypair.random().publicKey() },
        } as any),
      ).rejects.toThrow('processor down');
      expect(prisma.onrampTransaction.create).not.toHaveBeenCalled();
    });

    it('defaults payoutChain to stellar and payoutTokenCode to null when neither is set', async () => {
      rampProcessor.initiateOnramp.mockResolvedValue({ providerTransactionId: 'flint-tx-1', raw: {} });
      prisma.onrampTransaction.create.mockResolvedValue({ id: 'onramp-1', reference: 'txn_ref_x', createdAt: new Date('2026-01-01') });
      prisma.transactionLog.create.mockResolvedValue({});

      await service.onRamp('user-1', {
        network: 'stellar',
        amount: 10000,
        destination: { address: Keypair.random().publicKey() },
      } as any);

      expect(chainRegistry.findByName).toHaveBeenCalledWith('stellar');
      expect(prisma.onrampTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ payoutChain: 'stellar', payoutTokenCode: null }) }),
      );
      expect(corridorService.findByStablecoinCode).not.toHaveBeenCalled();
      expect(chainTokenRegistry.findByCode).not.toHaveBeenCalled();
    });

    it('defaults payoutTokenCode to USDC for an EVM payoutChain, with no extra validation call', async () => {
      chainRegistry.findByName.mockResolvedValue({ name: 'base', chainType: 'EVM' });
      rampProcessor.initiateOnramp.mockResolvedValue({ providerTransactionId: 'flint-tx-1', raw: {} });
      prisma.onrampTransaction.create.mockResolvedValue({ id: 'onramp-1', reference: 'txn_ref_x', createdAt: new Date('2026-01-01') });
      prisma.transactionLog.create.mockResolvedValue({});

      await service.onRamp('user-1', {
        network: 'stellar',
        amount: 10000,
        destination: { address: Keypair.random().publicKey() },
        payoutChain: 'base',
      } as any);

      expect(prisma.onrampTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ payoutChain: 'base', payoutTokenCode: 'USDC' }) }),
      );
      expect(corridorService.findByStablecoinCode).not.toHaveBeenCalled();
      expect(chainTokenRegistry.findByCode).not.toHaveBeenCalled();
    });

    it('skips validation when payoutTokenCode matches the corridor\'s own stablecoin', async () => {
      rampProcessor.initiateOnramp.mockResolvedValue({ providerTransactionId: 'flint-tx-1', raw: {} });
      prisma.onrampTransaction.create.mockResolvedValue({ id: 'onramp-1', reference: 'txn_ref_x', createdAt: new Date('2026-01-01') });
      prisma.transactionLog.create.mockResolvedValue({});

      await service.onRamp('user-1', {
        network: 'stellar',
        amount: 10000,
        destination: { address: Keypair.random().publicKey() },
        payoutTokenCode: 'cngn',
      } as any);

      expect(corridorService.findByStablecoinCode).not.toHaveBeenCalled();
      expect(prisma.onrampTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ payoutTokenCode: 'CNGN' }) }),
      );
    });

    it('validates a differing payoutTokenCode via CorridorService when payoutChain is stellar', async () => {
      corridorService.findByStablecoinCode
        .mockResolvedValueOnce(ngnCorridor) // the initial currency->corridor lookup
        .mockResolvedValueOnce({ stablecoinCode: 'BRZ' }); // the payoutTokenCode validation
      rampProcessor.initiateOnramp.mockResolvedValue({ providerTransactionId: 'flint-tx-1', raw: {} });
      prisma.onrampTransaction.create.mockResolvedValue({ id: 'onramp-1', reference: 'txn_ref_x', createdAt: new Date('2026-01-01') });
      prisma.transactionLog.create.mockResolvedValue({});

      await service.onRamp('user-1', {
        network: 'stellar',
        amount: 10000,
        destination: { address: Keypair.random().publicKey() },
        payoutTokenCode: 'BRZ',
      } as any);

      expect(corridorService.findByStablecoinCode).toHaveBeenCalledWith('BRZ');
    });

    it('validates a differing payoutTokenCode via ChainTokenRegistryService when payoutChain is an EVM chain', async () => {
      chainRegistry.findByName.mockResolvedValue({ name: 'base', chainType: 'EVM' });
      chainTokenRegistry.findByCode.mockResolvedValue({ tokenCode: 'BRZ', address: '0xbrz', decimals: 18 });
      rampProcessor.initiateOnramp.mockResolvedValue({ providerTransactionId: 'flint-tx-1', raw: {} });
      prisma.onrampTransaction.create.mockResolvedValue({ id: 'onramp-1', reference: 'txn_ref_x', createdAt: new Date('2026-01-01') });
      prisma.transactionLog.create.mockResolvedValue({});

      await service.onRamp('user-1', {
        network: 'stellar',
        amount: 10000,
        destination: { address: Keypair.random().publicKey() },
        payoutChain: 'base',
        payoutTokenCode: 'brz',
      } as any);

      expect(chainTokenRegistry.findByCode).toHaveBeenCalledWith('base', 'BRZ');
      expect(prisma.onrampTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ payoutChain: 'base', payoutTokenCode: 'BRZ' }) }),
      );
    });

    it('propagates an unregistered payoutChain as NotFoundException, before ever calling the processor', async () => {
      chainRegistry.findByName.mockRejectedValue(new NotFoundException('no such chain'));

      await expect(
        service.onRamp('user-1', {
          network: 'stellar',
          amount: 10000,
          destination: { address: Keypair.random().publicKey() },
          payoutChain: 'unknown-chain',
        } as any),
      ).rejects.toThrow(NotFoundException);
      expect(rampProcessor.initiateOnramp).not.toHaveBeenCalled();
    });
  });

  describe('offRamp', () => {
    it('validates the bank account but does NOT move any fiat yet — only after the crypto deposit is confirmed', async () => {
      prisma.offrampTransaction.create.mockResolvedValue({
        id: 'offramp-1',
        reference: 'txn_ref_y',
        status: 'PENDING',
        createdAt: new Date('2026-01-01'),
      });
      prisma.transactionLog.create.mockResolvedValue({});

      const result = await service.offRamp('user-1', {
        network: 'stellar',
        amount: 10000,
        destination: { bankCode: '058', accountNumber: '1234567890' },
      } as any);

      expect(rampProcessor.resolveAccount).toHaveBeenCalledWith(
        '058',
        '1234567890',
        expect.objectContaining({ currency: 'NGN' }),
      );
      expect(rampProcessor.executeOfframpPayout).not.toHaveBeenCalled();
      expect(prisma.offrampTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            network: 'stellar',
            memo: expect.stringMatching(/^txn_ref_/),
            flintTransactionId: null,
            accountName: 'JOHN DOE',
          }),
        }),
      );
      expect(result.data.depositAddress).toBe(distributionPublicKey);
      expect(result.data.memo).toEqual(expect.stringMatching(/^txn_ref_/));
    });

    it('throws if STELLAR_DISTRIBUTION_PUBLIC_KEY is not configured', async () => {
      configValues.STELLAR_DISTRIBUTION_PUBLIC_KEY = '';

      await expect(
        service.offRamp('user-1', {
          network: 'stellar',
          amount: 10000,
          destination: { bankCode: '058', accountNumber: '1234567890' },
        } as any),
      ).rejects.toThrow('STELLAR_DISTRIBUTION_PUBLIC_KEY missing');
      expect(rampProcessor.resolveAccount).not.toHaveBeenCalled();
    });
  });

  describe('confirmOfframpDeposit', () => {
    it('moves a PENDING offramp to PROCESSING and triggers the fiat payout once the on-chain deposit is verified', async () => {
      prisma.offrampTransaction.findUnique.mockResolvedValue(offrampFixture());
      stellarService.getTransactionByHash.mockResolvedValue({ successful: true });
      stellarService.findIncomingPaymentByMemo.mockResolvedValue({
        amount: '10000.0000000',
        transactionHash: 'depositHash',
      });
      prisma.offrampTransaction.update.mockResolvedValue({ status: 'PROCESSING', flintTransactionId: 'payout-1' });
      prisma.transactionLog.create.mockResolvedValue({});

      const result = await service.confirmOfframpDeposit('txn_ref_y', 'a'.repeat(64));

      expect(stellarService.findIncomingPaymentByMemo).toHaveBeenCalledWith(
        distributionPublicKey,
        'txn_ref_y',
        expect.anything(),
      );
      expect(prisma.offrampTransaction.updateMany).toHaveBeenCalledWith({
        where: { id: 'offramp-1', status: 'PENDING' },
        data: { status: 'PROCESSING' },
      });
      expect(rampProcessor.executeOfframpPayout).toHaveBeenCalledWith(
        expect.objectContaining({ reference: 'txn_ref_y', amount: 10000, bankCode: '058', accountNumber: '1234567890' }),
      );
      expect(prisma.offrampTransaction.update).toHaveBeenCalledWith({
        where: { id: 'offramp-1' },
        data: { flintTransactionId: 'payout-1' },
      });
      expect(result.status).toBe('PROCESSING');
    });

    it('is idempotent — returns as-is if already past PENDING', async () => {
      prisma.offrampTransaction.findUnique.mockResolvedValue({ id: 'offramp-1', status: 'PROCESSING' });

      const result = await service.confirmOfframpDeposit('txn_ref_y', 'a'.repeat(64));

      expect(result.status).toBe('PROCESSING');
      expect(stellarService.getTransactionByHash).not.toHaveBeenCalled();
    });

    it('rejects when the on-chain transaction cannot be verified', async () => {
      prisma.offrampTransaction.findUnique.mockResolvedValue(offrampFixture());
      stellarService.getTransactionByHash.mockResolvedValue(null);

      await expect(service.confirmOfframpDeposit('txn_ref_y', 'a'.repeat(64))).rejects.toThrow(
        'not found or not successful',
      );
      expect(prisma.offrampTransaction.updateMany).not.toHaveBeenCalled();
    });

    it('rejects when no matching memo-tagged deposit is found yet', async () => {
      prisma.offrampTransaction.findUnique.mockResolvedValue(offrampFixture());
      stellarService.getTransactionByHash.mockResolvedValue({ successful: true });
      stellarService.findIncomingPaymentByMemo.mockResolvedValue(null);

      await expect(service.confirmOfframpDeposit('txn_ref_y', 'a'.repeat(64))).rejects.toThrow(
        'Matching deposit not found',
      );
      expect(rampProcessor.executeOfframpPayout).not.toHaveBeenCalled();
    });

    it('throws NotFound for an unknown reference', async () => {
      prisma.offrampTransaction.findUnique.mockResolvedValue(null);
      await expect(service.confirmOfframpDeposit('missing', 'a'.repeat(64))).rejects.toThrow(
        'Offramp transaction not found',
      );
    });
  });

  describe('completeDepositIfMemoMatched (used by the client endpoint and the watcher)', () => {
    it('claims the transaction, then triggers the fiat payout — the watcher path (no hash to verify)', async () => {
      stellarService.findIncomingPaymentByMemo.mockResolvedValue({
        amount: '5000.0000000',
        transactionHash: 'depositHashX',
      });
      prisma.offrampTransaction.update.mockResolvedValue({ status: 'PROCESSING', flintTransactionId: 'payout-1' });
      prisma.transactionLog.create.mockResolvedValue({});

      const result = await service.completeDepositIfMemoMatched(offrampFixture({ memo: 'txn_ref_z' }));

      expect(stellarService.getTransactionByHash).not.toHaveBeenCalled();
      expect(rampProcessor.executeOfframpPayout).toHaveBeenCalled();
      expect(result.status).toBe('PROCESSING');
    });

    it('pays out only what was deposited when it is less than the declared amount (dust deposit)', async () => {
      stellarService.findIncomingPaymentByMemo.mockResolvedValue({
        amount: '0.0000001',
        transactionHash: 'dustHash',
      });
      prisma.offrampTransaction.update.mockResolvedValue({ status: 'PROCESSING' });

      await service.completeDepositIfMemoMatched(offrampFixture({ amount: '1000000' }));

      expect(rampProcessor.executeOfframpPayout).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 0.0000001 }),
      );
    });

    it('caps the payout at the declared amount when more was deposited', async () => {
      stellarService.findIncomingPaymentByMemo.mockResolvedValue({
        amount: '25000.0000000',
        transactionHash: 'overpaidHash',
      });
      prisma.offrampTransaction.update.mockResolvedValue({ status: 'PROCESSING' });

      await service.completeDepositIfMemoMatched(offrampFixture({ amount: '10000' }));

      expect(rampProcessor.executeOfframpPayout).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 10000 }),
      );
    });

    it('does not claim or pay out a zero-amount deposit', async () => {
      stellarService.findIncomingPaymentByMemo.mockResolvedValue({ amount: '0.0000000', transactionHash: 'zeroHash' });

      const result = await service.completeDepositIfMemoMatched(offrampFixture());

      expect(result).toBeNull();
      expect(prisma.offrampTransaction.updateMany).not.toHaveBeenCalled();
      expect(rampProcessor.executeOfframpPayout).not.toHaveBeenCalled();
    });

    it('does not double-trigger the payout when another caller already claimed the transaction', async () => {
      stellarService.findIncomingPaymentByMemo.mockResolvedValue({ amount: '5000', transactionHash: 'h' });
      prisma.offrampTransaction.updateMany.mockResolvedValue({ count: 0 }); // already claimed elsewhere
      prisma.offrampTransaction.findUnique.mockResolvedValue({ id: 'offramp-1', status: 'PROCESSING' });

      const result = await service.completeDepositIfMemoMatched(offrampFixture());

      expect(rampProcessor.executeOfframpPayout).not.toHaveBeenCalled();
      expect(result.status).toBe('PROCESSING');
    });

    it('leaves the transaction in PROCESSING (not reverted) and rethrows if the payout call fails', async () => {
      stellarService.findIncomingPaymentByMemo.mockResolvedValue({ amount: '5000', transactionHash: 'h' });
      rampProcessor.executeOfframpPayout.mockRejectedValue(new Error('processor down'));

      await expect(service.completeDepositIfMemoMatched(offrampFixture())).rejects.toThrow('processor down');
      // The claim (PENDING -> PROCESSING) already happened before the payout attempt.
      expect(prisma.offrampTransaction.updateMany).toHaveBeenCalledWith({
        where: { id: 'offramp-1', status: 'PENDING' },
        data: { status: 'PROCESSING' },
      });
    });

    it('returns null (not throw) when nothing matches yet', async () => {
      stellarService.findIncomingPaymentByMemo.mockResolvedValue(null);

      const result = await service.completeDepositIfMemoMatched(offrampFixture());

      expect(result).toBeNull();
      expect(prisma.offrampTransaction.updateMany).not.toHaveBeenCalled();
      expect(rampProcessor.executeOfframpPayout).not.toHaveBeenCalled();
    });

    it('returns null for a transaction that is not PENDING or has no memo', async () => {
      await expect(
        service.completeDepositIfMemoMatched(offrampFixture({ status: 'COMPLETED' })),
      ).resolves.toBeNull();
      await expect(
        service.completeDepositIfMemoMatched(offrampFixture({ memo: null })),
      ).resolves.toBeNull();
      expect(stellarService.findIncomingPaymentByMemo).not.toHaveBeenCalled();
    });
  });

  describe('findAndConfirmPendingDeposits (scheduled watcher entry point)', () => {
    it('checks every recent PENDING offramp with a memo and reports how many it confirmed', async () => {
      prisma.offrampTransaction.findMany.mockResolvedValue([
        offrampFixture({ id: 'a', reference: 'txn_ref_a', memo: 'txn_ref_a' }),
        offrampFixture({ id: 'b', reference: 'txn_ref_b', memo: 'txn_ref_b' }),
      ]);
      stellarService.findIncomingPaymentByMemo
        .mockResolvedValueOnce({ amount: '100', transactionHash: 'h1' }) // a: found
        .mockResolvedValueOnce(null); // b: not found yet
      prisma.offrampTransaction.update.mockResolvedValue({ status: 'PROCESSING' });
      prisma.transactionLog.create.mockResolvedValue({});

      const result = await service.findAndConfirmPendingDeposits();

      expect(result).toEqual({ checked: 2, confirmed: 1 });
      expect(prisma.offrampTransaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'PENDING', memo: { not: null } }),
        }),
      );
    });

    it('keeps going if one transaction throws, and still reports the rest', async () => {
      prisma.offrampTransaction.findMany.mockResolvedValue([
        offrampFixture({ id: 'a', reference: 'txn_ref_a', memo: 'txn_ref_a' }),
        offrampFixture({ id: 'b', reference: 'txn_ref_b', memo: 'txn_ref_b' }),
      ]);
      stellarService.findIncomingPaymentByMemo
        .mockRejectedValueOnce(new Error('horizon timeout'))
        .mockResolvedValueOnce({ amount: '100', transactionHash: 'h2' });
      prisma.offrampTransaction.update.mockResolvedValue({ status: 'PROCESSING' });
      prisma.transactionLog.create.mockResolvedValue({});

      const result = await service.findAndConfirmPendingDeposits();

      expect(result).toEqual({ checked: 2, confirmed: 1 });
    });
  });

  describe('getBanks / resolveAccount', () => {
    it('delegates directly to the ramp processor', async () => {
      rampProcessor.getBanks.mockResolvedValue({ data: [] });
      rampProcessor.resolveAccount.mockResolvedValue({ data: { accountName: 'JOHN DOE' } });

      await expect(service.getBanks()).resolves.toEqual({ data: [] });
      await expect(service.resolveAccount('058', '1234567890')).resolves.toEqual({
        data: { accountName: 'JOHN DOE' },
      });
      expect(rampProcessor.resolveAccount).toHaveBeenCalledWith('058', '1234567890', undefined);
    });
  });
});
