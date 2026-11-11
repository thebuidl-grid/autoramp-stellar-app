import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../database/prisma.service';
import { BridgeService } from './bridge.service';
import { BridgeReconciliationService } from './bridge-reconciliation.service';

describe('BridgeReconciliationService', () => {
  let service: BridgeReconciliationService;
  let prisma: any;
  let bridgeService: any;

  beforeEach(async () => {
    prisma = {
      bridgeTransaction: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    bridgeService = {
      mirrorBridgeStatusToOfframp: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BridgeReconciliationService,
        { provide: PrismaService, useValue: prisma },
        { provide: BridgeService, useValue: bridgeService },
      ],
    }).compile();

    service = module.get<BridgeReconciliationService>(
      BridgeReconciliationService,
    );
  });

  const minutesAgo = (n: number) => new Date(Date.now() - n * 60 * 1000);

  it('returns 0 and writes nothing when there is nothing stale', async () => {
    const reconciled = await service.sweep();

    expect(reconciled).toBe(0);
    expect(prisma.bridgeTransaction.update).not.toHaveBeenCalled();
    expect(
      bridgeService.mirrorBridgeStatusToOfframp,
    ).not.toHaveBeenCalled();
  });

  it('marks a very old in-flight transfer FAILED so the payout can expire', async () => {
    prisma.bridgeTransaction.findMany.mockResolvedValue([
      {
        reference: 'BRG-dead',
        status: 'PROCESSING',
        offrampReference: 'OFF-2',
        updatedAt: minutesAgo(7 * 60),
        metadata: {},
      },
    ]);

    const reconciled = await service.sweep();

    expect(reconciled).toBe(1);
    expect(prisma.bridgeTransaction.update).toHaveBeenCalledWith({
      where: { reference: 'BRG-dead' },
      data: expect.objectContaining({ status: 'FAILED' }),
    });
    expect(bridgeService.mirrorBridgeStatusToOfframp).toHaveBeenCalledWith(
      'OFF-2',
      'FAILED',
    );
  });

  it('leaves a recent in-flight transfer PENDING (no delayed/stuck states)', async () => {
    prisma.bridgeTransaction.findMany.mockResolvedValue([]);

    const reconciled = await service.sweep();

    expect(reconciled).toBe(0);
    const where = JSON.stringify(
      prisma.bridgeTransaction.findMany.mock.calls[0][0].where,
    );
    expect(where).toContain('updatedAt');
    expect(prisma.bridgeTransaction.update).not.toHaveBeenCalled();
  });
});
