import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OfframpDeliveryService } from './offramp-delivery.service';
import { PrismaService } from '../../database/prisma.service';
import { CorridorService } from '../corridor/corridor.service';
import { RampProcessorRegistry } from './ramp-processor.registry';
import { RampProcessor } from './ramp-processor.interface';

const ngnCorridor = {
  countryCode: 'NG',
  fiatCurrency: 'NGN',
  stablecoinCode: 'CNGN',
  rampProcessorProvider: 'flint',
};

describe('OfframpDeliveryService', () => {
  let service: OfframpDeliveryService;
  let prisma: {
    offrampTransaction: { create: jest.Mock; update: jest.Mock };
    transactionLog: { create: jest.Mock };
  };
  let corridorService: { findByCurrency: jest.Mock };
  let rampProcessor: jest.Mocked<RampProcessor>;
  let rampProcessorRegistry: { get: jest.Mock };

  beforeEach(async () => {
    prisma = {
      offrampTransaction: { create: jest.fn(), update: jest.fn() },
      transactionLog: { create: jest.fn() },
    };
    corridorService = { findByCurrency: jest.fn().mockResolvedValue(ngnCorridor) };
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OfframpDeliveryService,
        { provide: PrismaService, useValue: prisma },
        { provide: CorridorService, useValue: corridorService },
        { provide: RampProcessorRegistry, useValue: rampProcessorRegistry },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('https://webhook.example.com') } },
      ],
    }).compile();

    service = module.get<OfframpDeliveryService>(OfframpDeliveryService);
  });

  it('resolves the account, creates a PROCESSING offramp transaction with no memo-watch step, and calls executeOfframpPayout directly', async () => {
    prisma.offrampTransaction.create.mockResolvedValue({ id: 'offramp-1', reference: 'txn_ref_z' });
    prisma.offrampTransaction.update.mockResolvedValue({});

    const result = await service.executePayout({
      userId: 'user-1',
      fiatAmount: '160000',
      fiatCurrency: 'ngn',
      bankCode: '058',
      accountNumber: '0123456789',
      bridgeReference: 'txn_ref_bridge_a',
    });

    expect(corridorService.findByCurrency).toHaveBeenCalledWith('NGN');
    expect(rampProcessor.resolveAccount).toHaveBeenCalledWith('058', '0123456789', { currency: 'NGN', countryCode: 'NG' });
    expect(prisma.offrampTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          amount: '160000',
          currency: 'NGN',
          tokenType: 'USDC',
          status: 'PROCESSING',
          bankCode: '058',
          accountNumber: '0123456789',
          accountName: 'JOHN DOE',
          network: 'bridge',
          metadata: { bridgeReference: 'txn_ref_bridge_a' },
        }),
      }),
    );
    expect(rampProcessor.executeOfframpPayout).toHaveBeenCalledWith(
      expect.objectContaining({
        reference: 'txn_ref_z',
        amount: 160000,
        bankCode: '058',
        accountNumber: '0123456789',
        currency: 'NGN',
        countryCode: 'NG',
      }),
    );
    expect(prisma.offrampTransaction.update).toHaveBeenCalledWith({
      where: { id: 'offramp-1' },
      data: { flintTransactionId: 'payout-1' },
    });
    expect(result).toEqual({ offrampReference: 'txn_ref_z', providerTransactionId: 'payout-1' });
  });

  it('leaves the transaction in PROCESSING (not retried here) and rethrows when the payout call fails', async () => {
    prisma.offrampTransaction.create.mockResolvedValue({ id: 'offramp-1', reference: 'txn_ref_z' });
    rampProcessor.executeOfframpPayout.mockRejectedValue(new Error('processor down'));

    await expect(
      service.executePayout({
        userId: 'user-1',
        fiatAmount: '160000',
        fiatCurrency: 'NGN',
        bankCode: '058',
        accountNumber: '0123456789',
        bridgeReference: 'txn_ref_bridge_a',
      }),
    ).rejects.toThrow('processor down');

    expect(prisma.offrampTransaction.update).not.toHaveBeenCalled();
  });

  it('falls back to a null accountName when the processor response has no name field', async () => {
    prisma.offrampTransaction.create.mockResolvedValue({ id: 'offramp-1', reference: 'txn_ref_z' });
    rampProcessor.resolveAccount.mockResolvedValue({ data: {} });

    await service.executePayout({
      userId: 'user-1',
      fiatAmount: '160000',
      fiatCurrency: 'NGN',
      bankCode: '058',
      accountNumber: '0123456789',
      bridgeReference: 'txn_ref_bridge_a',
    });

    expect(prisma.offrampTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ accountName: null }) }),
    );
  });
});
