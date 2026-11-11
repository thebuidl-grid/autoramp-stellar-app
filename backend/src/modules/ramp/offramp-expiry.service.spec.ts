import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../database/prisma.service';
import { OfframpExpiryService } from './offramp-expiry.service';
import { OfframpStateService } from './offramp-state.service';

describe('OfframpExpiryService', () => {
  let service: OfframpExpiryService;
  let prisma: any;
  let offrampState: any;

  beforeEach(async () => {
    prisma = {
      offrampProviderOrder: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
      offrampTransaction: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
      merchantOfframpTransaction: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      transactionLog: { create: jest.fn().mockResolvedValue({}) },
    };

    offrampState = { apply: jest.fn().mockResolvedValue({ outcome: 'APPLIED' }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OfframpExpiryService,
        { provide: PrismaService, useValue: prisma },
        { provide: OfframpStateService, useValue: offrampState },
      ],
    }).compile();

    service = module.get<OfframpExpiryService>(OfframpExpiryService);
  });

  it('expires a PENDING user off-ramp order past its funding window', async () => {
    prisma.offrampProviderOrder.findMany.mockResolvedValue([
      {
        id: 'po-1',
        reference: 'off_1',
        offrampTransactionId: 'tx-1',
        merchantOfframpTransactionId: null,
      },
    ]);
    prisma.offrampTransaction.findUnique.mockResolvedValue({
      id: 'tx-1',
      userId: 'u-1',
      status: 'PENDING',
      metadata: {},
    });

    const expired = await service.sweep();

    expect(expired).toBe(1);
    // D1: expiry goes through the state machine, which records the reason, detail, history and reconciliation.
    expect(offrampState.apply).toHaveBeenCalledWith(
      'tx-1',
      'EXPIRED',
      expect.objectContaining({
        actor: 'expiry-sweeper',
        reason: 'timeout',
        eventKey: 'expiry:tx-1',
        detail: expect.objectContaining({ trigger: 'funding_window', stateWhenExpired: 'PENDING' }),
      }),
    );
  });

  it('expires a merchant off-ramp order (null expiresAt handled via parent)', async () => {
    prisma.offrampProviderOrder.findMany.mockResolvedValue([
      {
        id: 'po-2',
        reference: 'off_2',
        offrampTransactionId: null,
        merchantOfframpTransactionId: 'mtx-2',
      },
    ]);
    prisma.merchantOfframpTransaction.findUnique.mockResolvedValue({
      id: 'mtx-2',
      status: 'PROCESSING',
      metadata: {},
    });

    const expired = await service.sweep();

    expect(expired).toBe(1);
    expect(prisma.merchantOfframpTransaction.update).toHaveBeenCalledWith({
      where: { id: 'mtx-2' },
      data: expect.objectContaining({ status: 'EXPIRED' }),
    });
  });

  it('skips orders whose parent transaction is already terminal', async () => {
    prisma.offrampProviderOrder.findMany.mockResolvedValue([
      {
        id: 'po-3',
        reference: 'off_3',
        offrampTransactionId: 'tx-3',
        merchantOfframpTransactionId: null,
      },
    ]);
    prisma.offrampTransaction.findUnique.mockResolvedValue({
      id: 'tx-3',
      userId: 'u-3',
      status: 'COMPLETED',
      metadata: {},
    });

    const expired = await service.sweep();

    expect(expired).toBe(0);
    expect(offrampState.apply).not.toHaveBeenCalled();
    expect(prisma.offrampTransaction.update).not.toHaveBeenCalled();
    expect(prisma.offrampProviderOrder.update).not.toHaveBeenCalled();
  });

  it('returns 0 when there are no expired orders', async () => {
    prisma.offrampProviderOrder.findMany.mockResolvedValue([]);

    const expired = await service.sweep();

    expect(expired).toBe(0);
    expect(prisma.offrampTransaction.update).not.toHaveBeenCalled();
  });

  it('expires an order whose bridge delivery failed (FAILED) leaving it unfunded', async () => {
    prisma.offrampProviderOrder.findMany.mockResolvedValue([
      {
        id: 'po-4',
        reference: 'off_4',
        offrampTransactionId: 'tx-4',
        merchantOfframpTransactionId: null,
        bridgeReference: 'BRG-9',
        bridgeStatus: 'FAILED',
      },
    ]);
    prisma.offrampTransaction.findUnique.mockResolvedValue({
      id: 'tx-4',
      userId: 'u-4',
      status: 'PENDING',
      metadata: {},
    });

    const expired = await service.sweep();

    expect(expired).toBe(1);
    expect(offrampState.apply).toHaveBeenCalledWith('tx-4', 'EXPIRED', expect.objectContaining({ reason: 'timeout' }));
  });

  it('sweep query never treats a delivered (SUCCESS) bridge order as expirable', async () => {
    await service.sweep();

    expect(prisma.offrampProviderOrder.findMany).toHaveBeenCalledTimes(1);
    const call = prisma.offrampProviderOrder.findMany.mock.calls[0][0];
    const whereJson = JSON.stringify(call.where ?? {});

    expect(whereJson).toContain('in');
    expect(whereJson).toContain('FAILED');
    expect(whereJson).toContain('REJECTED');
    expect(whereJson).toContain('REVERSED');
    expect(whereJson).not.toContain('SUCCESS');
    // In-flight/stuck bridge states hold the order open, so they must not
    // appear as expirable statuses in the sweep query.
    expect(whereJson).not.toContain('PENDING');
    expect(whereJson).not.toContain('PROCESSING');
    expect(whereJson).not.toContain('DELAYED');
    expect(whereJson).not.toContain('STUCK');
    expect(whereJson).not.toContain('WAITING');
  });

  describe('per-state processing timeouts (D1)', () => {
    const ENV_KEYS = ['OFFRAMP_TIMEOUT_PAYOUT_PENDING_MS', 'OFFRAMP_TIMEOUT_AWAITING_DEPOSIT_MS'];
    const saved: Record<string, string | undefined> = {};
    beforeEach(() => ENV_KEYS.forEach((k) => (saved[k] = process.env[k])));
    afterEach(() => ENV_KEYS.forEach((k) => (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]))));

    const staleTx = (over: Record<string, unknown> = {}) => ({
      id: 'tx-9',
      reference: 'off_9',
      userId: 'u-9',
      status: 'PAYOUT_PENDING',
      updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2h ago
      providerOrder: { bridgeReference: null, bridgeStatus: null },
      ...over,
    });

    it('expires a transaction that stayed in PAYOUT_PENDING beyond its configured window, recording the window', async () => {
      process.env.OFFRAMP_TIMEOUT_PAYOUT_PENDING_MS = String(60 * 60 * 1000);
      prisma.offrampTransaction.findMany.mockResolvedValue([staleTx()]);

      const expired = await service.sweep();

      expect(expired).toBe(1);
      expect(offrampState.apply).toHaveBeenCalledWith(
        'tx-9',
        'EXPIRED',
        expect.objectContaining({
          reason: 'timeout',
          detail: expect.objectContaining({ trigger: 'state_timeout', stateWhenExpired: 'PAYOUT_PENDING', windowMs: 3600000 }),
        }),
      );
    });

    it('does not expire a transaction that is still inside its window', async () => {
      process.env.OFFRAMP_TIMEOUT_PAYOUT_PENDING_MS = String(6 * 60 * 60 * 1000);
      prisma.offrampTransaction.findMany.mockResolvedValue([staleTx()]);
      expect(await service.sweep()).toBe(0);
      expect(offrampState.apply).not.toHaveBeenCalled();
    });

    it('holds open a transaction whose bridge funding leg is in flight', async () => {
      process.env.OFFRAMP_TIMEOUT_PAYOUT_PENDING_MS = '1000';
      prisma.offrampTransaction.findMany.mockResolvedValue([
        staleTx({ providerOrder: { bridgeReference: 'BRG-1', bridgeStatus: 'PROCESSING' } }),
      ]);
      expect(await service.sweep()).toBe(0);
      expect(offrampState.apply).not.toHaveBeenCalled();
    });

    it('only counts expiries the state machine actually applied (duplicates are not double counted)', async () => {
      process.env.OFFRAMP_TIMEOUT_PAYOUT_PENDING_MS = '1000';
      offrampState.apply.mockResolvedValue({ outcome: 'DUPLICATE' });
      prisma.offrampTransaction.findMany.mockResolvedValue([staleTx()]);
      expect(await service.sweep()).toBe(0);
    });
  });
});
