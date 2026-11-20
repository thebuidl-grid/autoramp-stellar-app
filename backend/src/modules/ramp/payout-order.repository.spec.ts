import {
  PayoutOrderRepository,
  toPayoutOrder,
} from './payout-order.repository';

/**
 * In-memory stand-in for the two Prisma delegates the repository uses: `transactionLeg` (unique on transaction+role+provider)
 * and the legacy `offrampProviderOrder`. Enough behaviour to test mapping, dual write and the sweep selection for real.
 */
function makeDb() {
  const legs: any[] = [];
  const legacy: any[] = [];
  let seq = 0;
  const matches = (leg: any, where: any): boolean => {
    for (const [k, v] of Object.entries(where ?? {})) {
      if (k === 'OR') {
        if (!(v as any[]).some((w) => matches(leg, w))) return false;
      } else if (v && typeof v === 'object' && 'in' in (v as any)) {
        if (!(v as any).in.includes(leg[k])) return false;
      } else if (v && typeof v === 'object' && 'lt' in (v as any)) {
        if (!(leg[k] != null && leg[k] < (v as any).lt)) return false;
      } else if (leg[k] !== v) return false;
    }
    return true;
  };
  const db: any = {
    legs,
    legacy,
    transactionLeg: {
      findFirst: async ({ where }: any) =>
        legs.find((l) => matches(l, where)) ?? null,
      findMany: async ({ where }: any) => legs.filter((l) => matches(l, where)),
      findUnique: async ({ where }: any) =>
        legs.find((l) => l.id === where.id) ?? null,
      update: async ({ where, data }: any) => {
        const leg = legs.find((l) => l.id === where.id);
        Object.assign(leg, data, { updatedAt: new Date() });
        return leg;
      },
      upsert: async ({ where, create, update }: any) => {
        const k = where.transactionId_role_provider;
        const existing = legs.find(
          (l) =>
            l.transactionId === k.transactionId &&
            l.role === k.role &&
            l.provider === k.provider,
        );
        if (existing) return Object.assign(existing, update);
        const leg = {
          id: `leg-${++seq}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...create,
        };
        legs.push(leg);
        return leg;
      },
    },
    offrampProviderOrder: {
      create: jest.fn(async ({ data }: any) => {
        legacy.push({ id: `old-${++seq}`, ...data });
        return data;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const rows = legacy.filter((r) => r.reference === where.reference);
        rows.forEach((r) => Object.assign(r, data));
        return { count: rows.length };
      }),
    },
  };
  return db;
}

const base = {
  reference: 'off_1',
  transactionId: 'tx-1',
  isMerchant: false,
} as const;

describe('PayoutOrderRepository', () => {
  let db: any;
  let repo: PayoutOrderRepository;
  beforeEach(() => {
    db = makeDb();
    repo = new PayoutOrderRepository(db);
  });

  describe('create + lookups', () => {
    it('stores the order as a BITNOB payout leg and returns it in the old order shape', async () => {
      const order = await repo.create({
        ...base,
        providerOrderId: 'q1',
        sourceAddress: 'GSRC',
        fundingAddress: 'GFUND',
        expectedAmount: '5.5',
        memo: 'm1',
      });
      expect(db.legs).toHaveLength(1);
      expect(db.legs[0]).toMatchObject({
        role: 'PAYOUT',
        provider: 'BITNOB',
        scope: 'USER',
        reference: 'off_1',
        providerReference: 'q1',
      });
      expect(order).toMatchObject({
        reference: 'off_1',
        provider: 'bitnob',
        providerOrderId: 'q1',
        offrampTransactionId: 'tx-1',
        merchantOfframpTransactionId: null,
        fundingAddress: 'GFUND',
        expectedAmount: '5.5',
        memo: 'm1',
        bridgeReference: null,
        bridgeStatus: null,
      });
    });

    it('marks a merchant order with the merchant transaction id and scope', async () => {
      const order = await repo.create({ ...base, isMerchant: true });
      expect(db.legs[0].scope).toBe('MERCHANT');
      expect(order.merchantOfframpTransactionId).toBe('tx-1');
      expect(order.offrampTransactionId).toBeNull();
    });

    it('finds the order by reference, by the provider order id and by transaction id', async () => {
      await repo.create({ ...base, providerOrderId: 'q1' });
      expect((await repo.findByReference('off_1'))?.providerOrderId).toBe('q1');
      expect((await repo.findByProviderOrderId('q1'))?.reference).toBe('off_1');
      expect((await repo.findByTransactionId('tx-1'))?.reference).toBe('off_1');
      expect(await repo.findByReference('nope')).toBeNull();
      expect(await repo.findByProviderOrderId('nope')).toBeNull();
    });

    it('is idempotent per transaction (one payout leg, not two)', async () => {
      await repo.create({ ...base, providerOrderId: 'q1' });
      await repo.create({ ...base, providerOrderId: 'q2' });
      expect(db.legs.filter((l: any) => l.role === 'PAYOUT')).toHaveLength(1);
      expect(db.legs[0].providerReference).toBe('q2');
    });
  });

  describe('update', () => {
    it('maps old field names onto the payout leg', async () => {
      const order = await repo.create({ ...base, providerOrderId: 'q1' });
      const updated = await repo.update(order, {
        providerStatus: 'payout.settled',
        receivedAmount: '5.5',
        outstandingAmount: '0',
        failureReason: null,
        depositTxHash: '0xabc',
        failureDetail: { why: 'x' },
      });
      expect(db.legs[0]).toMatchObject({
        status: 'payout.settled',
        receivedAmount: '5.5',
        outstandingAmount: '0',
        depositTxHash: '0xabc',
        failureDetail: { why: 'x' },
      });
      expect(updated).toMatchObject({
        providerStatus: 'payout.settled',
        receivedAmount: '5.5',
        depositTxHash: '0xabc',
      });
    });

    it('puts bridge fields on a CCTP bridge leg of the same transaction, created on first use', async () => {
      const order = await repo.create({ ...base });
      const updated = await repo.update(order, {
        bridgeReference: 'br_1',
        bridgeStatus: 'PENDING',
      });
      const bridge = db.legs.find((l: any) => l.role === 'BRIDGE');
      expect(bridge).toMatchObject({
        provider: 'CCTP',
        transactionId: 'tx-1',
        providerReference: 'br_1',
        status: 'PENDING',
        reference: 'off_1',
      });
      expect(updated).toMatchObject({
        bridgeReference: 'br_1',
        bridgeStatus: 'PENDING',
      });

      await repo.update(updated, { bridgeStatus: 'SUCCESS' });
      expect(db.legs.filter((l: any) => l.role === 'BRIDGE')).toHaveLength(1);
      expect((await repo.findByReference('off_1'))?.bridgeStatus).toBe(
        'SUCCESS',
      );
    });

    it('leaves fields it was not given untouched', async () => {
      const order = await repo.create({
        ...base,
        providerOrderId: 'q1',
        fundingAddress: 'GFUND',
      });
      await repo.update(order, { providerStatus: 'payout.created' });
      expect(db.legs[0]).toMatchObject({
        providerReference: 'q1',
        fundingAddress: 'GFUND',
        status: 'payout.created',
      });
    });
  });

  it('does not touch the old offramp_provider_orders table', async () => {
    const order = await repo.create({ ...base, providerOrderId: 'q1' });
    await repo.update(order, { providerStatus: 'payout.settled' });
    expect(db.offrampProviderOrder.create).not.toHaveBeenCalled();
    expect(db.offrampProviderOrder.updateMany).not.toHaveBeenCalled();
    expect(db.legacy).toHaveLength(0);
  });

  describe('findExpirable (the expiry sweep)', () => {
    const NOW = new Date('2026-11-20T12:00:00Z');
    const CUTOFF = new Date('2026-11-19T12:00:00Z');
    const FAILED = ['FAILED', 'REJECTED', 'REVERSED'];
    const past = new Date('2026-11-20T10:00:00Z');
    const future = new Date('2026-11-20T14:00:00Z');

    it('returns orders whose funding window passed, and ignores ones still open', async () => {
      await repo.create({
        reference: 'old',
        transactionId: 't-old',
        isMerchant: false,
        expiresAt: past,
      });
      await repo.create({
        reference: 'open',
        transactionId: 't-open',
        isMerchant: false,
        expiresAt: future,
      });
      const out = await repo.findExpirable(NOW, CUTOFF, FAILED);
      expect(out.map((o) => o.reference)).toEqual(['old']);
      expect(out[0]).toMatchObject({
        offrampTransactionId: 't-old',
        merchantOfframpTransactionId: null,
      });
    });

    it('holds open an order whose bridge leg is in flight or delivered, and expires one whose bridge failed', async () => {
      for (const [ref, status] of [
        ['pending', 'PENDING'],
        ['success', 'SUCCESS'],
        ['failed', 'FAILED'],
      ] as const) {
        const order = await repo.create({
          reference: ref,
          transactionId: `t-${ref}`,
          isMerchant: false,
          expiresAt: past,
        });
        await repo.update(order, {
          bridgeReference: `br_${ref}`,
          bridgeStatus: status,
        });
      }
      await repo.create({
        reference: 'nobridge',
        transactionId: 't-nobridge',
        isMerchant: false,
        expiresAt: past,
      });
      const out = (await repo.findExpirable(NOW, CUTOFF, FAILED))
        .map((o) => o.reference)
        .sort();
      expect(out).toEqual(['failed', 'nobridge']);
    });

    it('expires an order with no window only after the fallback cutoff', async () => {
      const young = await repo.create({
        reference: 'young',
        transactionId: 't-young',
        isMerchant: false,
      });
      const aged = await repo.create({
        reference: 'aged',
        transactionId: 't-aged',
        isMerchant: false,
      });
      db.legs.find((l: any) => l.id === young.id).createdAt = new Date(
        '2026-11-20T11:00:00Z',
      );
      db.legs.find((l: any) => l.id === aged.id).createdAt = new Date(
        '2026-11-18T11:00:00Z',
      );
      const out = (await repo.findExpirable(NOW, CUTOFF, FAILED)).map(
        (o) => o.reference,
      );
      expect(out).toEqual(['aged']);
    });
  });

  describe('attach', () => {
    it('attachMany fills providerOrder for a whole list, matching each transaction to its own order and bridge leg', async () => {
      const a = await repo.create({
        reference: 'a',
        transactionId: 't-a',
        isMerchant: false,
        providerOrderId: 'qa',
        fundingAddress: 'GA',
      });
      await repo.create({
        reference: 'b',
        transactionId: 't-b',
        isMerchant: false,
        providerOrderId: 'qb',
        fundingAddress: 'GB',
      });
      await repo.update(a, {
        bridgeReference: 'br_a',
        bridgeStatus: 'SUCCESS',
      });
      const calls = jest.spyOn(db.transactionLeg, 'findMany');

      const out = await repo.attachMany([
        { id: 't-a' },
        { id: 't-b' },
        { id: 't-none' },
      ]);

      expect(calls).toHaveBeenCalledTimes(2); // one query for payout legs, one for bridge legs
      expect(out.map((t) => t.providerOrder?.fundingAddress ?? null)).toEqual([
        'GA',
        'GB',
        null,
      ]);
      expect(out[0].providerOrder).toMatchObject({
        bridgeReference: 'br_a',
        bridgeStatus: 'SUCCESS',
      });
      expect(out[1].providerOrder?.bridgeReference).toBeNull();
      expect(await repo.attachMany([])).toEqual([]);
    });

    it('adds providerOrder to a transaction, like include: { providerOrder: true } did', async () => {
      await repo.create({ ...base, providerOrderId: 'q1' });
      const tx = await repo.attach({ id: 'tx-1', status: 'PENDING' });
      expect(tx?.providerOrder?.providerOrderId).toBe('q1');
      expect((await repo.attach({ id: 'tx-none' }))?.providerOrder).toBeNull();
      expect(await repo.attach(null)).toBeNull();
    });
  });

  describe('toPayoutOrder', () => {
    it('takes the deposit hash from the bridge leg when the payout leg has none', () => {
      const order = toPayoutOrder(
        {
          id: 'p',
          scope: 'USER',
          transactionId: 't',
          reference: 'r',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          providerReference: 'br',
          status: 'SUCCESS',
          depositTxHash: '0xbridge',
        },
      );
      expect(order.depositTxHash).toBe('0xbridge');
      expect(order.bridgeReference).toBe('br');
    });
  });
});
