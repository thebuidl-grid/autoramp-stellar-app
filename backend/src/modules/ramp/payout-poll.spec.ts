import { Test, TestingModule } from '@nestjs/testing';
import {
  canRecoverToCompleted,
  RECOVERABLE_STATES,
  canTransition,
} from './offramp-state-machine';
import { OfframpExpiryService } from './offramp-expiry.service';
import { OfframpStateService } from './offramp-state.service';
import { PayoutOrderRepository } from './payout-order.repository';
import {
  PayoutPollService,
  extractPayout,
  isBitnobPayoutId,
  isPayoutNews,
  POLLABLE_STATUSES,
} from './payout-poll.service';
import { PrismaService } from '../../database/prisma.service';
import { makeFakePrisma } from './testing/fake-offramp-prisma';
import { payoutOrdersOver } from './testing/payout-orders-double';

const PAYOUT_UUID = '3f0a9c2e-1b6d-4c7e-9a10-5d2f8e7b6a41';

describe('isPayoutNews — only act when Bitnob tells us something new', () => {
  it('SUCCESS is news for everything except an order that is already completed or reversed', () => {
    for (const ours of [
      'AWAITING_DEPOSIT',
      'PAYOUT_PENDING',
      'PROCESSING',
      'EXPIRED',
      'FAILED',
      'REJECTED',
      'INSUFFICIENT_LIQUIDITY',
      'PARTIALLY_SETTLED',
    ]) {
      expect(isPayoutNews('SUCCESS', ours)).toBe(true);
    }
    expect(isPayoutNews('SUCCESS', 'COMPLETED')).toBe(false);
    expect(isPayoutNews('SUCCESS', 'REVERSED')).toBe(false);
  });
  it('FAILED / EXPIRED are only news while we still think it is open', () => {
    expect(isPayoutNews('FAILED', 'PAYOUT_PENDING')).toBe(true);
    expect(isPayoutNews('FAILED', 'EXPIRED')).toBe(false);
    expect(isPayoutNews('FAILED', 'COMPLETED')).toBe(false); // never un-complete a paid order
    expect(isPayoutNews('EXPIRED', 'AWAITING_DEPOSIT')).toBe(true);
    expect(isPayoutNews('EXPIRED', 'FAILED')).toBe(false);
  });
  it('PROCESSING is news only before the payout stage; UNDERPAYMENT once', () => {
    expect(isPayoutNews('PROCESSING', 'AWAITING_DEPOSIT')).toBe(true);
    expect(isPayoutNews('PROCESSING', 'PAYOUT_PENDING')).toBe(false);
    expect(isPayoutNews('UNDERPAYMENT', 'DEPOSIT_DETECTED')).toBe(true);
    expect(isPayoutNews('UNDERPAYMENT', 'PARTIALLY_SETTLED')).toBe(false);
  });
  it('quiet statuses and missing values are never news', () => {
    for (const p of [
      'QUOTE',
      'INITIATED',
      'PENDING',
      'PENDING_ADDRESS_DEPOSIT',
      'SOMETHING_NEW',
    ])
      expect(isPayoutNews(p, 'AWAITING_DEPOSIT')).toBe(false);
    expect(isPayoutNews('', 'EXPIRED')).toBe(false);
    expect(isPayoutNews('SUCCESS', '')).toBe(false);
    expect(isPayoutNews(undefined, undefined)).toBe(false);
  });
  it('is case-insensitive', () =>
    expect(isPayoutNews('success', 'expired')).toBe(true));
  it('polls the open states and the gave-up ones, never the finished ones', () => {
    for (const s of [
      'EXPIRED',
      'FAILED',
      'REJECTED',
      'PAYOUT_PENDING',
      'AWAITING_DEPOSIT',
    ])
      expect(POLLABLE_STATUSES).toContain(s);
    for (const s of ['COMPLETED', 'REVERSED'])
      expect(POLLABLE_STATUSES).not.toContain(s);
  });
});

describe('extractPayout — Bitnob wraps a payout', () => {
  it('reads data.payout, and tolerates flatter shapes', () => {
    expect(
      extractPayout({ data: { payout: { status: 'SUCCESS' } } }).status,
    ).toBe('SUCCESS');
    expect(extractPayout({ data: { status: 'FAILED' } }).status).toBe('FAILED');
    expect(extractPayout({ status: 'PENDING' }).status).toBe('PENDING');
    expect(extractPayout(null)).toBeNull();
  });
});

describe('the state machine: recovery is only for a provider-confirmed settlement', () => {
  it('keeps EXPIRED / FAILED / REJECTED final for everything we infer ourselves', () => {
    for (const from of ['EXPIRED', 'FAILED', 'REJECTED'])
      expect(canTransition(from, 'COMPLETED')).toBe(false);
  });
  it('names exactly the states a provider "settled" may override, and only towards COMPLETED', () => {
    expect([...RECOVERABLE_STATES].sort()).toEqual([
      'EXPIRED',
      'FAILED',
      'INSUFFICIENT_LIQUIDITY',
      'REJECTED',
    ]);
    expect(canRecoverToCompleted('EXPIRED')).toBe(true);
    expect(canRecoverToCompleted('expired')).toBe(true);
    expect(canRecoverToCompleted('PAYOUT_PENDING')).toBe(false); // that one progresses normally
    expect(canRecoverToCompleted('REVERSED')).toBe(false); // money went back: never overwrite
    expect(canRecoverToCompleted('COMPLETED')).toBe(false);
    expect(canRecoverToCompleted(null)).toBe(false);
  });
});

describe('PayoutPollService', () => {
  const build = (
    over: {
      getPayoutByReference?: jest.Mock;
      processWebhook?: jest.Mock;
      order?: any;
    } = {},
  ) => {
    const getPayoutByReference =
      over.getPayoutByReference ??
      jest.fn().mockResolvedValue({
        data: { payout: { id: PAYOUT_UUID, status: 'SUCCESS', reference: 'off_1' } },
      });
    const processWebhook =
      over.processWebhook ?? jest.fn().mockResolvedValue({ status: 'success' });
    const order =
      over.order === undefined
        ? { id: 'o', reference: 'off_1', providerOrderId: PAYOUT_UUID }
        : over.order;
    const payoutOrders: any = {
      findByTransactionId: jest.fn().mockResolvedValue(order),
    };
    const svc = new PayoutPollService(
      {} as any,
      { getPayoutByReference } as any,
      { processWebhook } as any,
      payoutOrders,
    );
    return { svc, getPayoutByReference, processWebhook, payoutOrders };
  };

  it('feeds a provider SUCCESS through the webhook path, so an expired order is recovered', async () => {
    const { svc, processWebhook, getPayoutByReference } = build();
    const r = await svc.pollTransaction('tx-1', 'EXPIRED');
    expect(r).toEqual({ outcome: 'applied', providerStatus: 'SUCCESS' });
    expect(getPayoutByReference).toHaveBeenCalledWith('off_1');
    expect(processWebhook).toHaveBeenCalledWith({
      event: 'payouts.success',
      data: expect.objectContaining({
        id: PAYOUT_UUID,
        reference: 'off_1',
        status: 'SUCCESS',
      }),
    });
  });

  it('does nothing, and writes nothing, when Bitnob has nothing new', async () => {
    const { svc, processWebhook } = build({
      getPayoutByReference: jest
        .fn()
        .mockResolvedValue({ data: { payout: { status: 'PENDING' } } }),
    });
    expect(await svc.pollTransaction('tx-1', 'AWAITING_DEPOSIT')).toEqual({
      outcome: 'unchanged',
      providerStatus: 'PENDING',
    });
    expect(processWebhook).not.toHaveBeenCalled();
    const done = build();
    expect((await done.svc.pollTransaction('tx-1', 'COMPLETED')).outcome).toBe(
      'unchanged',
    ); // already completed
    expect(done.processWebhook).not.toHaveBeenCalled();
  });

  it('says "unreachable" rather than guessing when Bitnob errors or answers without a status', async () => {
    expect(
      (
        await build({
          getPayoutByReference: jest.fn().mockRejectedValue(new Error('timeout')),
        }).svc.pollTransaction('t', 'EXPIRED')
      ).outcome,
    ).toBe('unreachable');
    expect(
      (
        await build({
          getPayoutByReference: jest.fn().mockResolvedValue({ data: {} }),
        }).svc.pollTransaction('t', 'EXPIRED')
      ).outcome,
    ).toBe('unreachable');
  });

  it('looks up by our reference even when the stored provider id is still a quote id', async () => {
    expect(isBitnobPayoutId('3f0a9c2e-1b6d-4c7e-9a10-5d2f8e7b6a41')).toBe(true);
    for (const bad of ['QT2_21908021', '', null, undefined, 'not-a-uuid']) expect(isBitnobPayoutId(bad as any)).toBe(false);
    const { svc, getPayoutByReference } = build({ order: { id: 'o', reference: 'off_1', providerOrderId: 'QT2_21908021' } });
    expect((await svc.pollTransaction('tx-1', 'AWAITING_DEPOSIT')).outcome).toBe('unchanged');
    expect(getPayoutByReference).toHaveBeenCalledWith('off_1');
  });

  it('says "no_provider" for an order that never reached Bitnob', async () => {
    expect(
      (await build({ order: null }).svc.pollTransaction('t', 'EXPIRED'))
        .outcome,
    ).toBe('no_provider');
    expect(
      (
        await build({
          order: { reference: 'r', providerOrderId: null },
        }).svc.pollTransaction('t', 'EXPIRED')
      ).outcome,
    ).toBe('no_provider');
  });

  it('reports the update as not applied when the webhook path ignored it (duplicate / invalid)', async () => {
    const { svc } = build({
      processWebhook: jest
        .fn()
        .mockResolvedValue({ status: 'ignored', reason: 'duplicate_event' }),
    });
    expect((await svc.pollTransaction('t', 'EXPIRED')).outcome).toBe(
      'unchanged',
    );
  });

  it('survives the webhook path throwing', async () => {
    const { svc } = build({
      processWebhook: jest.fn().mockRejectedValue(new Error('db down')),
    });
    expect((await svc.pollTransaction('t', 'EXPIRED')).outcome).toBe(
      'unreachable',
    );
  });

  describe('sweep', () => {
    it('polls recent orders that can still change, oldest first, and counts the updated ones', async () => {
      const calls: string[] = [];
      const prisma: any = {
        offrampTransaction: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'u2',
              status: 'EXPIRED',
              updatedAt: new Date('2026-11-20T11:00:00Z'),
            },
            {
              id: 'u1',
              status: 'PAYOUT_PENDING',
              updatedAt: new Date('2026-11-20T10:00:00Z'),
            },
          ]),
        },
        merchantOfframpTransaction: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'm1',
              status: 'FAILED',
              updatedAt: new Date('2026-11-20T10:30:00Z'),
            },
          ]),
        },
      };
      const svc = new PayoutPollService(
        prisma,
        {} as any,
        {} as any,
        {} as any,
      );
      jest.spyOn(svc, 'pollTransaction').mockImplementation(async (id) => {
        calls.push(id);
        return { outcome: id === 'u2' ? 'applied' : 'unchanged' };
      });
      const updated = await svc.sweep(new Date('2026-11-20T12:00:00Z'));
      expect(calls).toEqual(['u1', 'm1', 'u2']);
      expect(updated).toBe(1);
      const where = prisma.offrampTransaction.findMany.mock.calls[0][0].where;
      expect(where.status.in).toContain('EXPIRED');
      expect(where.status.in).not.toContain('COMPLETED');
      expect(where.updatedAt.gt).toEqual(new Date('2026-11-06T12:00:00Z')); // 14-day window
    });
    it('does not overlap itself', async () => {
      let release: () => void = () => undefined;
      const gate = new Promise<void>((r) => (release = r));
      const prisma: any = {
        offrampTransaction: { findMany: jest.fn(() => gate.then(() => [])) },
        merchantOfframpTransaction: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      };
      const svc = new PayoutPollService(
        prisma,
        {} as any,
        {} as any,
        {} as any,
      );
      const first = svc.sweep();
      expect(await svc.sweep()).toBe(0); // a second run while one is in flight returns at once
      release();
      await first;
    });
  });
});

describe('OfframpExpiryService — never give up on an order Bitnob might have paid', () => {
  const make = async (poll: any) => {
    const orders = [
      {
        id: 'o',
        reference: 'off_1',
        offrampTransactionId: 'tx-1',
        merchantOfframpTransactionId: null,
      },
    ];
    const prisma: any = {
      offrampTransaction: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'tx-1',
          reference: 'off_1',
          status: 'AWAITING_DEPOSIT',
          metadata: {},
        }),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
      merchantOfframpTransaction: { findUnique: jest.fn(), update: jest.fn() },
      transactionLog: { create: jest.fn() },
    };
    const offrampState = {
      apply: jest.fn().mockResolvedValue({ outcome: 'APPLIED' }),
    };
    const payoutOrders = {
      findExpirable: jest.fn().mockResolvedValue(orders),
      attachMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    };
    const pollTransaction = jest.fn().mockResolvedValue(poll);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OfframpExpiryService,
        { provide: PrismaService, useValue: prisma },
        { provide: PayoutOrderRepository, useValue: payoutOrders },
        { provide: OfframpStateService, useValue: offrampState },
        { provide: PayoutPollService, useValue: { pollTransaction } },
      ],
    }).compile();
    return {
      svc: module.get(OfframpExpiryService),
      offrampState,
      pollTransaction,
    };
  };

  it('expires an order Bitnob has nothing newer about (or never saw)', async () => {
    for (const poll of [
      { outcome: 'no_provider' },
      { outcome: 'unchanged', providerStatus: 'PENDING_ADDRESS_DEPOSIT' },
    ]) {
      const { svc, offrampState } = await make(poll);
      expect(await svc.sweep()).toBeGreaterThanOrEqual(1);
      expect(offrampState.apply).toHaveBeenCalledWith(
        'tx-1',
        'EXPIRED',
        expect.anything(),
      );
    }
  });
  it("asks Bitnob first, with the order's current status", async () => {
    const { svc, pollTransaction } = await make({ outcome: 'no_provider' });
    await svc.sweep();
    expect(pollTransaction).toHaveBeenCalledWith('tx-1', 'AWAITING_DEPOSIT');
  });
  it('does NOT expire when Bitnob could not be reached: it may have been paid', async () => {
    const { svc, offrampState } = await make({ outcome: 'unreachable' });
    await svc.sweep();
    expect(offrampState.apply).not.toHaveBeenCalled();
  });
  it("does NOT expire when Bitnob's answer just changed the order (it may now be completed)", async () => {
    const { svc, offrampState } = await make({
      outcome: 'applied',
      providerStatus: 'SUCCESS',
    });
    await svc.sweep();
    expect(offrampState.apply).not.toHaveBeenCalled();
  });
  it('does NOT expire while Bitnob says the payout is being processed', async () => {
    const { svc, offrampState } = await make({
      outcome: 'unchanged',
      providerStatus: 'PROCESSING',
    });
    await svc.sweep();
    expect(offrampState.apply).not.toHaveBeenCalled();
  });
});
