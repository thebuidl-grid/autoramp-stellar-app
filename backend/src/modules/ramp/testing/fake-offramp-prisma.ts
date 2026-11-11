/**
 * Stateful in-memory stand-in for the Prisma delegates the off-ramp state service uses.
 * It enforces the same unique constraints (event key, one reversal per transaction) and rolls back
 * a failed $transaction, so tests exercise real behaviour rather than counting mock calls.
 */
export function makeFakePrisma() {
  let db = {
    tx: new Map<string, any>(),
    po: new Map<string, any>(), // keyed by offrampTransactionId
    logs: [] as any[],
    recs: new Map<string, any>(), // keyed by offrampTransactionId
    reversals: new Map<string, any>(), // keyed by offrampTransactionId
    events: new Map<string, any>(), // keyed by eventKey
  };
  let seq = 0;
  let clock = Date.parse('2026-11-10T10:00:00Z');
  const tick = () => new Date((clock += 1000));
  const newId = (p: string) => `${p}-${++seq}`;
  const unique = (target: string) => Object.assign(new Error(`Unique constraint failed on ${target}`), { code: 'P2002', meta: { target: [target] } });

  const withRelations = (row: any, include: any) => ({
    ...row,
    ...(include?.providerOrder ? { providerOrder: db.po.get(row.id) ?? null } : {}),
    ...(include?.reconciliation ? { reconciliation: db.recs.get(row.id) ?? null } : {}),
    ...(include?.reversal ? { reversal: db.reversals.get(row.id) ?? null } : {}),
  });

  const fake: any = {
    _db: () => db,
    offrampTransaction: {
      findUnique: async ({ where, include }: any) => {
        const row = [...db.tx.values()].find((r) => (where.id ? r.id === where.id : r.reference === where.reference));
        return row ? withRelations(row, include) : null;
      },
      updateMany: async ({ where, data }: any) => {
        const row = db.tx.get(where.id);
        if (!row || (where.status && row.status !== where.status)) return { count: 0 };
        Object.assign(row, data, { updatedAt: tick() });
        return { count: 1 };
      },
    },
    offrampProviderOrder: {
      update: async ({ where, data }: any) => {
        const row = [...db.po.values()].find((r) => r.id === where.id);
        Object.assign(row, data);
        return row;
      },
    },
    transactionLog: {
      create: async ({ data }: any) => {
        const row = { id: newId('log'), ...data, createdAt: tick() };
        db.logs.push(row);
        return row;
      },
      findMany: async ({ where }: any) =>
        db.logs.filter((l) => l.transactionId === where.transactionId && l.transactionType === where.transactionType),
    },
    offrampReconciliation: {
      upsert: async ({ where, create, update }: any) => {
        const existing = db.recs.get(where.offrampTransactionId);
        const row = existing
          ? Object.assign(existing, update, { updatedAt: tick() })
          : { id: newId('rec'), createdAt: tick(), updatedAt: tick(), settledAt: null, ...create };
        db.recs.set(where.offrampTransactionId, row);
        return row;
      },
      findUnique: async ({ where }: any) => {
        const row = [...db.recs.values()].find((r) => r.reference === where.reference);
        return row ? { ...row, offrampTransaction: { userId: db.tx.get(row.offrampTransactionId)?.userId } } : null;
      },
      findMany: async ({ where }: any) =>
        [...db.recs.values()]
          .filter((r) => (!where.status || r.status === where.status) && (!where.result || r.result === where.result))
          .filter((r) => !where.offrampTransaction?.userId || db.tx.get(r.offrampTransactionId)?.userId === where.offrampTransaction.userId),
    },
    offrampReversal: {
      create: async ({ data }: any) => {
        if (db.reversals.has(data.offrampTransactionId)) throw unique('offramp_transaction_id');
        if (data.providerEventId && [...db.reversals.values()].some((r) => r.providerEventId === data.providerEventId)) throw unique('provider_event_id');
        const row = { id: newId('rev'), createdAt: tick(), ...data };
        db.reversals.set(data.offrampTransactionId, row);
        return row;
      },
    },
    offrampEvent: {
      create: async ({ data }: any) => {
        if (db.events.has(data.eventKey)) throw unique('event_key');
        const row = { id: newId('evt'), createdAt: tick(), ...data };
        db.events.set(data.eventKey, row);
        return row;
      },
      findUnique: async ({ where }: any) => db.events.get(where.eventKey) ?? null,
    },
    /** Runs the callback against the same store, restoring a snapshot if it throws (atomicity). */
    $transaction: async (cb: (tx: any) => Promise<unknown>) => {
      const snapshot = structuredClone(db);
      try {
        return await cb(fake);
      } catch (e) {
        db = snapshot;
        throw e;
      }
    },
  };
  return fake;
}

/** Seed one off-ramp transaction (+ provider order) and return its ids. */
export function seedOfframp(
  fake: any,
  opts: { status?: string; expectedUsdc?: string; fiat?: string; reference?: string; userId?: string; depositTxHash?: string | null } = {},
) {
  const db = fake._db();
  const id = `tx-${db.tx.size + 1}`;
  const reference = opts.reference ?? `off_test_${db.tx.size + 1}`;
  db.tx.set(id, {
    id,
    userId: opts.userId ?? 'user-1',
    reference,
    status: opts.status ?? 'INITIATED',
    fiatAmount: opts.fiat ?? '7500',
    settledFiatAmount: null,
    currency: 'NGN',
    completedAt: null,
    createdAt: new Date('2026-11-10T09:59:00Z'),
    updatedAt: new Date('2026-11-10T09:59:00Z'),
  });
  db.po.set(id, {
    id: `po-${id}`,
    offrampTransactionId: id,
    reference,
    providerOrderId: `bitnob-${id}`,
    expectedAmount: opts.expectedUsdc ?? '5',
    receivedAmount: null,
    depositTxHash: opts.depositTxHash ?? null,
    failureReason: null,
    failureDetail: null,
    outstandingAmount: null,
  });
  return { id, reference };
}
