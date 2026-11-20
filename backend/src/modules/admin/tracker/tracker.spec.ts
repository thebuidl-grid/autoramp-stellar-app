import { NotFoundException } from '@nestjs/common';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AdminGuard } from 'src/modules/auth/guards/admin.guard';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import {
  AdminTrackerController,
  AdminWebhooksController,
} from './admin-tracker.controller';
import { AdminWebhooksService, MATCHED_SQL } from './admin-webhooks.service';
import { HealthQueryDto, WebhooksQueryDto } from './tracker.dto';
import {
  FAILED_STATUSES,
  OPEN_STATUSES,
  TRACKER_SOURCES,
  stuckMaxAgeDays,
  stuckThresholdMinutes,
} from './tracker.sources';
import {
  TransactionHealthService,
  stuckWhere,
} from './transaction-health.service';
import {
  TransactionTraceService,
  buildTimeline,
  findFailure,
  humanize,
} from './transaction-trace.service';

const T = (s: string) => new Date(`2026-11-20T${s}Z`);

describe('stuck thresholds', () => {
  it('gives every open status a limit, longer for the one waiting on the customer', () => {
    for (const s of OPEN_STATUSES)
      expect(stuckThresholdMinutes(s, {})).toBeGreaterThan(0);
    expect(stuckThresholdMinutes('AWAITING_DEPOSIT', {})).toBeGreaterThan(
      stuckThresholdMinutes('PAYOUT_PENDING', {}),
    );
  });
  it('can be tuned per status or for all, and ignores junk values', () => {
    expect(
      stuckThresholdMinutes('PAYOUT_PENDING', {
        STUCK_AFTER_PAYOUT_PENDING_MINUTES: '5',
      }),
    ).toBe(5);
    expect(
      stuckThresholdMinutes('PROCESSING', { STUCK_AFTER_MINUTES: '90' }),
    ).toBe(90);
    expect(
      stuckThresholdMinutes('PAYOUT_PENDING', {
        STUCK_AFTER_PAYOUT_PENDING_MINUTES: '5',
        STUCK_AFTER_MINUTES: '90',
      }),
    ).toBe(5); // specific beats general
    expect(
      stuckThresholdMinutes('PROCESSING', { STUCK_AFTER_MINUTES: 'abc' }),
    ).toBe(30);
    expect(
      stuckThresholdMinutes('PROCESSING', { STUCK_AFTER_MINUTES: '-4' }),
    ).toBe(30);
  });
  it('builds one condition per open status, each with its own cutoff', () => {
    const now = new Date('2026-11-20T12:00:00Z');
    const where = stuckWhere(now, undefined, {});
    expect(where.OR).toHaveLength(OPEN_STATUSES.length);
    const payout = where.OR.find((c) => c.status === 'PAYOUT_PENDING')!;
    expect(payout.updatedAt.lt).toEqual(new Date('2026-11-20T11:30:00Z')); // 30 minutes
    expect(
      stuckWhere(now, 120, {}).OR.every(
        (c) =>
          c.updatedAt.lt.getTime() ===
          new Date('2026-11-20T10:00:00Z').getTime(),
      ),
    ).toBe(true);
  });
  it('treats anything untouched for weeks as abandoned, not stuck, unless asked', () => {
    const now = new Date('2026-11-20T12:00:00Z');
    expect(stuckMaxAgeDays({})).toBe(14);
    expect(stuckMaxAgeDays({ STUCK_MAX_AGE_DAYS: '3' })).toBe(3);
    expect(stuckMaxAgeDays({ STUCK_MAX_AGE_DAYS: 'x' })).toBe(14);
    const bounded = stuckWhere(now, undefined, {}).OR[0].updatedAt as any;
    expect(bounded.gt).toEqual(new Date('2026-11-06T12:00:00Z'));
    expect(
      (stuckWhere(now, undefined, {}, true).OR[0].updatedAt as any).gt,
    ).toBeUndefined();
  });
  it('never calls a finished or failed transaction stuck', () => {
    for (const f of FAILED_STATUSES)
      expect(OPEN_STATUSES).not.toContain(f as never);
    expect(OPEN_STATUSES).not.toContain('COMPLETED' as never);
  });
});

describe('buildTimeline / findFailure', () => {
  const legs = [
    {
      id: 'leg-1',
      provider: 'CCTP',
      role: 'BRIDGE',
      createdAt: T('10:01:00'),
      lastEventAt: T('10:09:00'),
      failedStep: 'attestation',
      failureReason: 'attestation timed out',
    },
  ];
  const logs = [
    {
      createdAt: T('10:02:00'),
      action: 'status_transition',
      oldStatus: 'INITIATED',
      newStatus: 'AWAITING_DEPOSIT',
      description: 'Funding instructions issued',
    },
    {
      createdAt: T('10:05:00'),
      action: 'step',
      step: 'burn_submitted',
      provider: 'CCTP',
      outcome: 'OK',
      legId: 'leg-1',
    },
    {
      createdAt: T('10:08:00'),
      action: 'step',
      step: 'attestation_poll',
      provider: 'CCTP',
      outcome: 'FAILED',
      description: 'no attestation yet',
      legId: 'leg-1',
    },
  ];
  const events = [
    {
      id: 'ev-1',
      provider: 'bitnob',
      eventType: 'payout.created',
      status: 'created',
      createdAt: T('10:03:00'),
      processed: true,
      payload: { a: 1 },
    },
  ];

  it('merges logs, webhooks and legs oldest first, starting with Created', () => {
    const tl = buildTimeline({ createdAt: T('10:00:00'), legs, logs, events });
    expect(tl.map((e) => e.at)).toEqual([...tl.map((e) => e.at)].sort());
    expect(tl[0]).toMatchObject({ kind: 'created', title: 'Created' });
    expect(tl.map((e) => e.kind)).toEqual([
      'created',
      'leg',
      'log',
      'webhook',
      'log',
      'log',
      'leg',
    ]);
  });
  it('titles status changes as from → to and steps in plain words', () => {
    const tl = buildTimeline({
      createdAt: T('10:00:00'),
      legs: [],
      logs,
      events: [],
    });
    expect(tl.find((e) => e.from === 'INITIATED')!.title).toBe(
      'Initiated → Awaiting deposit',
    );
    expect(tl.find((e) => e.step === 'burn_submitted')!.title).toBe(
      'Burn submitted',
    );
  });
  it('marks a webhook that failed to process, and keeps its payload for the drawer', () => {
    const tl = buildTimeline({
      createdAt: T('10:00:00'),
      legs: [],
      logs: [],
      events: [
        { ...events[0], processed: false, errorMessage: 'bad signature' },
      ],
    });
    const w = tl.find((e) => e.kind === 'webhook')!;
    expect(w).toMatchObject({
      outcome: 'FAILED',
      error: 'bad signature',
      processed: false,
      detail: { a: 1 },
      title: 'Bitnob: payout.created',
    });
  });
  it('keeps the natural order when two things happen in the same instant', () => {
    const at = T('10:00:00');
    const tl = buildTimeline({
      createdAt: at,
      legs: [{ id: 'l', provider: 'BITNOB', role: 'PAYOUT', createdAt: at }],
      logs: [{ createdAt: at, action: 'created' }],
      events: [{ id: 'e', createdAt: at }],
    });
    expect(tl.map((e) => e.kind)).toEqual(['created', 'leg', 'log', 'webhook']);
  });
  it('names where it failed: a leg beats a log, and a clean run has no failure', () => {
    expect(findFailure(legs, logs)).toEqual({
      step: 'attestation',
      provider: 'CCTP',
      reason: 'attestation timed out',
    });
    expect(findFailure([], logs)).toEqual({
      step: 'attestation_poll',
      provider: 'CCTP',
      reason: 'no attestation yet',
    });
    expect(findFailure([], [logs[0], logs[1]])).toBeNull();
  });
  it('humanizes', () =>
    expect(humanize('status_transition')).toBe('Status transition'));
});

/** A tiny in-memory Prisma: only the delegates and filters the services use. */
function fakePrisma(data: Record<string, any[]>) {
  const match = (row: any, where: any = {}): boolean =>
    Object.entries(where).every(([k, v]: [string, any]) => {
      if (k === 'OR') return v.some((w: any) => match(row, w));
      if (v && typeof v === 'object' && 'in' in v) return v.in.includes(row[k]);
      if (v && typeof v === 'object' && 'notIn' in v)
        return !v.notIn.includes(row[k]);
      if (v && typeof v === 'object' && ('lt' in v || 'gt' in v)) {
        const at = new Date(row[k]).getTime();
        return (
          ('lt' in v ? at < v.lt.getTime() : true) &&
          ('gt' in v ? at > v.gt.getTime() : true)
        );
      }
      return row[k] === v;
    });
  const delegate = (rows: any[]) => ({
    findMany: jest.fn(async ({ where, orderBy, take }: any = {}) => {
      let out = rows.filter((r) => match(r, where));
      const key = orderBy && Object.keys(orderBy)[0];
      if (key)
        out = [...out].sort(
          (a, b) =>
            (new Date(a[key]).getTime() - new Date(b[key]).getTime()) *
            (orderBy[key] === 'desc' ? -1 : 1),
        );
      return take ? out.slice(0, take) : out;
    }),
    findFirst: jest.fn(
      async ({ where }: any = {}) => rows.find((r) => match(r, where)) ?? null,
    ),
    count: jest.fn(
      async ({ where }: any = {}) => rows.filter((r) => match(r, where)).length,
    ),
  });
  const prisma: any = {};
  for (const s of TRACKER_SOURCES)
    prisma[s.model] = delegate(data[s.model] ?? []);
  for (const m of [
    'transaction',
    'merchantTransaction',
    'transactionLeg',
    'transactionFee',
    'virtualAccount',
    'transactionLog',
    'webhookEvent',
  ])
    prisma[m] = delegate(data[m] ?? []);
  return prisma;
}

describe('TransactionTraceService', () => {
  const swap = {
    id: 'sw-1',
    reference: 'txn_ref_X',
    status: 'COMPLETED',
    fromAmount: '100',
    fromTokenType: 'USDC',
    userId: 'u1',
    createdAt: T('09:00:00'),
    updatedAt: T('09:30:00'),
  };
  const offramp = {
    id: 'of-1',
    chainNetwork: 'testnet',
    reference: 'txn_ref_X',
    status: 'PAYOUT_PENDING',
    amount: '98',
    tokenType: 'USDC',
    userId: 'u1',
    createdAt: T('09:01:00'),
    updatedAt: T('09:40:00'),
  };

  const service = (extra: Record<string, any[]> = {}) =>
    new TransactionTraceService(
      fakePrisma({
        swapTransaction: [swap],
        offrampTransaction: [offramp],
        transaction: [
          { id: 'of-1', relatedId: 'sw-1' },
          { id: 'sw-1', relatedId: 'of-1' },
        ],
        transactionFee: [],
        transactionLeg: [
          {
            id: 'leg-1',
            transactionId: 'of-1',
            role: 'PAYOUT',
            provider: 'BITNOB',
            status: 'payout.created',
            createdAt: T('09:02:00'),
            expectedAmount: '98',
            providerReference: 'q1',
          },
        ],
        transactionLog: [
          {
            id: 'l1',
            transactionId: 'of-1',
            createdAt: T('09:03:00'),
            action: 'status_transition',
            oldStatus: 'INITIATED',
            newStatus: 'AWAITING_DEPOSIT',
          },
        ],
        webhookEvent: [
          {
            id: 'w1',
            transactionId: 'of-1',
            reference: 'txn_ref_X',
            provider: 'bitnob',
            eventType: 'payout.created',
            createdAt: T('09:04:00'),
            processed: true,
          },
        ],
        ...extra,
      }) as never,
    );

  it('returns both halves of a swap and its off-ramp, with their own status, legs and timeline', async () => {
    const out = await service().trace('txn_ref_X');
    expect(out.transactions.map((t) => t.transaction.type).sort()).toEqual([
      'offramp',
      'swap',
    ]);
    const of = out.transactions.find((t) => t.transaction.type === 'offramp')!;
    expect(of).toMatchObject({ relatedId: 'sw-1', hasParentRow: true });
    expect(of.transaction).toMatchObject({
      status: 'PAYOUT_PENDING',
      amount: '98',
      currency: 'NGN',
      ownerId: 'u1',
      scope: 'USER',
      chainNetwork: 'testnet',
    });
    const swapHalf = out.transactions.find((t) => t.transaction.type === 'swap')!;
    expect(swapHalf.transaction.chainNetwork).toBeNull(); // not recorded: unknown, never guessed
    expect(of.legs[0]).toMatchObject({
      provider: 'BITNOB',
      role: 'PAYOUT',
      expectedAmount: '98',
    });
    expect(of.timeline.map((e) => e.kind)).toEqual([
      'created',
      'leg',
      'log',
      'webhook',
    ]);
    const sw = out.transactions.find((t) => t.transaction.type === 'swap')!;
    expect(sw.legs).toEqual([]);
    expect(sw.transaction.amount).toBe('100');
  });

  it('still traces a transaction that has no parent row yet (created after the backfill)', async () => {
    const out = await service({ transaction: [] }).trace('txn_ref_X');
    expect(out.transactions).toHaveLength(2);
    expect(
      out.transactions.every(
        (t) => t.hasParentRow === false && t.relatedId === null,
      ),
    ).toBe(true);
  });

  it('lists webhook events that carry the reference but are tied to nothing we have', async () => {
    const out = await service({
      webhookEvent: [
        {
          id: 'orphan',
          transactionId: 'ghost',
          reference: 'txn_ref_X',
          provider: 'safehaven',
          eventType: 'virtualAccount.transfer',
          createdAt: T('09:05:00'),
        },
      ],
    }).trace('txn_ref_X');
    expect(out.unlinkedWebhooks).toEqual([
      expect.objectContaining({
        id: 'orphan',
        provider: 'safehaven',
        transactionId: 'ghost',
      }),
    ]);
  });

  it('answers 404 for an unknown reference, and for a blank one', async () => {
    await expect(service().trace('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service().trace('   ')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('can trace by an event alone (a webhook for a reference we have no transaction for)', async () => {
    const out = await new TransactionTraceService(
      fakePrisma({
        webhookEvent: [
          {
            id: 'o',
            transactionId: 'x',
            reference: 'R1',
            createdAt: T('09:00:00'),
          },
        ],
      }) as never,
    ).trace('R1');
    expect(out.transactions).toEqual([]);
    expect(out.unlinkedWebhooks).toHaveLength(1);
  });
});

describe('TransactionHealthService', () => {
  const now = new Date('2026-11-20T12:00:00Z');
  const rows = {
    offrampTransaction: [
      {
        id: 'o1',
        reference: 'off_1',
        status: 'PAYOUT_PENDING',
        amount: '5',
        tokenType: 'USDC',
        userId: 'u',
        createdAt: T('09:00:00'),
        updatedAt: T('10:00:00'),
      }, // 2h: stuck (limit 30m)
      {
        id: 'o2',
        reference: 'off_2',
        status: 'PAYOUT_PENDING',
        amount: '5',
        tokenType: 'USDC',
        userId: 'u',
        createdAt: T('11:50:00'),
        updatedAt: T('11:50:00'),
      }, // 10m: fine
      {
        id: 'o3',
        reference: 'off_3',
        status: 'FAILED',
        amount: '9',
        tokenType: 'USDC',
        userId: 'u',
        createdAt: T('08:00:00'),
        updatedAt: T('09:00:00'),
      },
      {
        id: 'o4',
        reference: 'off_4',
        status: 'COMPLETED',
        amount: '9',
        tokenType: 'USDC',
        userId: 'u',
        createdAt: T('08:00:00'),
        updatedAt: T('08:30:00'),
      },
    ],
    onrampTransaction: [
      {
        id: 'n1',
        reference: 'on_1',
        status: 'PENDING',
        amount: '1000',
        currency: 'NGN',
        userId: 'u',
        createdAt: T('05:00:00'),
        updatedAt: T('05:00:00'),
      },
      // months old: abandoned, not stuck
      {
        id: 'n2',
        reference: 'on_old',
        status: 'PENDING',
        amount: '1000',
        currency: 'NGN',
        userId: 'u',
        createdAt: new Date('2026-09-01T05:00:00Z'),
        updatedAt: new Date('2026-09-01T05:00:00Z'),
      },
    ], // 7h: stuck (limit 60m)
    transactionFee: [],
    transactionLeg: [
      {
        id: 'g1',
        transactionId: 'o1',
        role: 'BRIDGE',
        provider: 'CCTP',
        status: 'PENDING',
        failedStep: 'attestation',
        failureReason: 'timed out',
        createdAt: T('09:01:00'),
      },
    ],
    transactionLog: [
      {
        id: 'lg',
        transactionId: 'o1',
        createdAt: T('10:00:00'),
        action: 'step',
        step: 'burn_confirmed',
      },
    ],
  };
  const svc = () => new TransactionHealthService(fakePrisma(rows) as never);

  it('finds what has been open for longer than its status allows, oldest first, across tables', async () => {
    const out = await svc().list('stuck', { limit: 25, offset: 0 }, now);
    expect(out.items.map((i) => i.reference)).toEqual(['on_1', 'off_1']);
    expect(out.total).toBe(2);
    expect(out.items.find((i) => i.reference === 'off_2')).toBeUndefined(); // 10 minutes is not stuck
  });
  it('leaves abandoned ones out of "stuck" by default, but can include them', async () => {
    const hidden = await svc().list('stuck', { limit: 25, offset: 0 }, now);
    expect(hidden.items.map((i) => i.reference)).not.toContain('on_old');
    expect(hidden.total).toBe(2);
    const all = await svc().list(
      'stuck',
      { includeAbandoned: true, limit: 25, offset: 0 },
      now,
    );
    expect(all.items.map((i) => i.reference)).toContain('on_old');
    expect(all.total).toBe(3);
  });
  it('says how long, where it stopped, and which providers it touched', async () => {
    const o1 = (
      await svc().list('stuck', { limit: 25, offset: 0 }, now)
    ).items.find((i) => i.reference === 'off_1')!;
    expect(o1).toMatchObject({
      type: 'offramp',
      status: 'PAYOUT_PENDING',
      ageMinutes: 120,
      lastStep: 'burn_confirmed',
      amount: '5',
      currency: 'NGN',
    });
    expect(o1.providers).toEqual([
      {
        provider: 'CCTP',
        role: 'BRIDGE',
        status: 'PENDING',
        failedStep: 'attestation',
        failureReason: 'timed out',
      },
    ]);
  });
  it('lists failures newest first and never includes completed ones', async () => {
    const out = await svc().list('failed', { limit: 25, offset: 0 }, now);
    expect(out.items.map((i) => i.reference)).toEqual(['off_3']);
  });
  it('filters by type and by provider, and pages', async () => {
    expect(
      (
        await svc().list('stuck', { type: 'onramp', limit: 25, offset: 0 }, now)
      ).items.map((i) => i.reference),
    ).toEqual(['on_1']);
    expect(
      (
        await svc().list(
          'stuck',
          { provider: 'cctp', limit: 25, offset: 0 },
          now,
        )
      ).items.map((i) => i.reference),
    ).toEqual(['off_1']);
    expect(
      (await svc().list('stuck', { limit: 1, offset: 1 }, now)).items.map(
        (i) => i.reference,
      ),
    ).toEqual(['off_1']);
  });
  it('lets the caller choose how old is too old', async () => {
    expect(
      (
        await svc().list(
          'stuck',
          { olderThanMinutes: 600, limit: 25, offset: 0 },
          now,
        )
      ).items,
    ).toEqual([]);
    expect(
      (
        await svc().list(
          'stuck',
          { olderThanMinutes: 5, limit: 25, offset: 0 },
          now,
        )
      ).items
        .map((i) => i.reference)
        .sort(),
    ).toEqual(['off_1', 'off_2', 'on_1']);
  });
  it('counts failed and stuck for the dashboard', async () => {
    expect(await svc().counts(now)).toEqual({ failed: 1, stuck: 2 }); // the abandoned one is not counted
  });
});

describe('AdminWebhooksService', () => {
  const capture = () => {
    const calls: any[] = [];
    const prisma: any = {
      $queryRaw: jest.fn(async (sql: any) => {
        calls.push(sql);
        return sql.sql.includes('count(*)')
          ? [{ n: BigInt(438) }]
          : [
              {
                id: 'w1',
                provider: 'safehaven',
                eventType: 'virtualAccount.transfer',
                status: 'Completed',
                reference: 'ref',
                transactionType: 'onramp',
                transactionId: 't',
                processed: true,
                errorMessage: null,
                legId: null,
                inboundWebhookId: null,
                createdAt: new Date('2026-11-20T10:00:00Z'),
                matched: false,
              },
            ];
      }),
      webhookEvent: { findUnique: jest.fn() },
      inboundWebhook: { findUnique: jest.fn() },
    };
    return { prisma, calls, svc: new AdminWebhooksService(prisma) };
  };

  it('checks every transaction table to decide whether an event is matched', () => {
    for (const s of TRACKER_SOURCES) expect(MATCHED_SQL.sql).toContain(s.table);
    expect((MATCHED_SQL.sql.match(/EXISTS/g) ?? []).length).toBe(
      TRACKER_SOURCES.length,
    );
  });

  it('lists unmatched events with the provider as a bound value (never spliced into the SQL)', async () => {
    const { svc, calls } = capture();
    const out = await svc.list({
      matched: false,
      provider: "safe'; DROP TABLE x;--",
      limit: 25,
      offset: 50,
    });
    const list = calls[0];
    expect(list.sql).toMatch(/NOT \(EXISTS/);
    expect(list.sql).not.toContain('DROP TABLE');
    expect(list.values).toEqual(
      expect.arrayContaining(["safe'; drop table x;--", 25, 50]),
    );
    expect(out).toMatchObject({ total: 438, limit: 25, offset: 50 });
    expect(out.items[0]).toMatchObject({
      id: 'w1',
      matched: false,
      createdAt: '2026-11-20T10:00:00.000Z',
    });
  });

  it('adds only the conditions it was asked for', async () => {
    const { svc, calls } = capture();
    await svc.list({ limit: 10, offset: 0 });
    expect(calls[0].sql).not.toMatch(
      /lower\(w\.provider\)|w\.processed =|NOT \(EXISTS/,
    );
    await svc.list({ matched: true, processed: false, limit: 10, offset: 0 });
    expect(calls[2].sql).toMatch(/w\.processed = /);
    expect(calls[2].sql).not.toMatch(/NOT \(EXISTS/);
  });

  it('counts unmatched events', async () => {
    const { svc } = capture();
    expect(await svc.countUnmatched()).toBe(438);
  });

  it('returns one event in full with its raw receipt, and 404s for an unknown id', async () => {
    const { svc, prisma } = capture();
    prisma.webhookEvent.findUnique.mockResolvedValue({
      id: 'w1',
      provider: 'bitnob',
      eventType: 'payout.settled',
      status: 'ok',
      reference: 'r',
      transactionType: 'offramp',
      transactionId: 't',
      processed: true,
      processedAt: new Date('2026-11-20T10:01:00Z'),
      errorMessage: null,
      legId: 'leg',
      inboundWebhookId: 'in1',
      createdAt: new Date('2026-11-20T10:00:00Z'),
      payload: { x: 1 },
    });
    prisma.inboundWebhook.findUnique.mockResolvedValue({
      id: 'in1',
      endpoint: '/webhook/bitnob',
      status: 'completed',
      error: null,
      receivedAt: new Date('2026-11-20T09:59:59Z'),
      payload: { raw: true },
    });
    prisma.$queryRaw.mockResolvedValue([{ matched: true }]);
    const out = await svc.detail('w1');
    expect(out).toMatchObject({
      id: 'w1',
      matched: true,
      payload: { x: 1 },
      inbound: {
        id: 'in1',
        endpoint: '/webhook/bitnob',
        payload: { raw: true },
      },
    });

    prisma.webhookEvent.findUnique.mockResolvedValue(null);
    prisma.inboundWebhook.findUnique.mockResolvedValue(null); // no stored event and no raw receipt either
    await expect(svc.detail('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('controllers', () => {
  it('are admin-only: JWT + admin guard on every route', () => {
    for (const c of [AdminTrackerController, AdminWebhooksController])
      expect(Reflect.getMetadata(GUARDS_METADATA, c)).toEqual([
        JwtAuthGuard,
        AdminGuard,
      ]);
  });
  it('declare the fixed paths before :reference/trace so they are never read as a reference', () => {
    const proto = AdminTrackerController.prototype as any;
    const order = Object.getOwnPropertyNames(proto)
      .filter((n) => n !== 'constructor')
      .map((n) => Reflect.getMetadata(PATH_METADATA, proto[n]));
    expect(order).toEqual(['attention', 'stuck', 'failed', ':reference/trace', ':reference/reconcile']);
  });
});

describe('query DTOs', () => {
  it('reads matched=false from a query string and bounds the page size', async () => {
    const ok = plainToInstance(WebhooksQueryDto, {
      matched: 'false',
      processed: 'true',
      limit: '50',
      offset: '0',
    });
    expect(await validate(ok)).toHaveLength(0);
    expect(ok.matched).toBe(false);
    expect(ok.processed).toBe(true);
    expect(
      await validate(plainToInstance(WebhooksQueryDto, { limit: '500' })),
    ).not.toHaveLength(0);
    expect(
      await validate(plainToInstance(WebhooksQueryDto, { matched: 'maybe' })),
    ).not.toHaveLength(0);
  });
  it('only accepts known transaction types', async () => {
    expect(
      await validate(
        plainToInstance(HealthQueryDto, { type: 'offramp', limit: '25' }),
      ),
    ).toHaveLength(0);
    expect(
      await validate(plainToInstance(HealthQueryDto, { type: 'drop' })),
    ).not.toHaveLength(0);
    expect(
      await validate(
        plainToInstance(HealthQueryDto, { olderThanMinutes: '0' }),
      ),
    ).not.toHaveLength(0);
  });
});

describe('trace money: fees, expected and settled', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { buildMoney, sumDecimals } = require('./transaction-trace.service');
  it('adds decimals exactly', () => {
    expect(sumDecimals(['0.1', '0.2'])).toBe('0.3');
    expect(sumDecimals(['100', '7.50', '0.01'])).toBe('107.51');
    expect(sumDecimals([])).toBe('0');
  });
  it('lists each fee, totals them in one currency, and shows expected vs settled', () => {
    const m = buildMoney(
      { fiatAmount: '149700.00', settledFiatAmount: '149700.00' },
      [{ feeType: 'provider_fee', feeAmount: '50.00', feeCurrency: 'NGN' }, { feeType: 'vat', feeAmount: '3.75', feeCurrency: 'NGN' }],
    );
    expect(m.fees).toHaveLength(2);
    expect(m.feeTotal).toEqual({ amount: '53.75', currency: 'NGN' });
    expect(m.expected).toBe('149700.00');
    expect(m.sent).toBeNull();
    expect(m.settled).toBe('149700.00');
  });
  it('falls back to the recorded fee column, and leaves settled empty until it settles', () => {
    const m = buildMoney({ feeAmount: '0.5', feeCurrency: 'USDC', fiatAmount: '1000' }, []);
    expect(m.feeTotal).toEqual({ amount: '0.5', currency: 'USDC' });
    expect(m.settled).toBeNull();
    expect(buildMoney({}, []).feeTotal).toBeNull();
  });
  it('does not add fees in different currencies together', () => {
    const m = buildMoney({}, [{ feeType: 'a', feeAmount: '1', feeCurrency: 'NGN' }, { feeType: 'b', feeAmount: '1', feeCurrency: 'USDC' }]);
    expect(m.feeTotal).toBeNull();
  });
});

describe('trace: the virtual account and what happened on it', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { buildVirtualAccount } = require('./transaction-trace.service');
  const events = [
    { id: 'e2', eventType: 'virtualAccount.transfer', status: 'Completed', processed: true, transactionId: 't1', createdAt: new Date('2026-11-20T10:05:00Z') },
    { id: 'e1', eventType: 'virtualAccount.transfer', status: 'Failed', processed: false, transactionId: null, errorMessage: 'no match', createdAt: new Date('2026-11-20T10:00:00Z') },
  ];
  it('shows the account from the VirtualAccount row with its activity', () => {
    const va = buildVirtualAccount(
      { accountNumber: '0902672602', accountName: 'AutoRamp / Ada', bankName: 'Safehaven MFB', bankCode: '090286', status: 'ACTIVE', amount: '150000', reference: 'va_1', externalReference: 'ext_1', expiresAt: new Date('2026-11-21T10:00:00Z'), createdAt: new Date('2026-11-20T09:00:00Z') },
      null,
      events,
    );
    expect(va).toMatchObject({ accountNumber: '0902672602', bankName: 'Safehaven MFB', status: 'ACTIVE', expectedAmount: '150000', reference: 'va_1' });
    expect(va.activity.map((a: any) => a.id)).toEqual(['e2', 'e1']);
    expect(va.activity[1]).toMatchObject({ processed: false, transactionId: null, errorMessage: 'no match' });
  });
  it('falls back to the deposit account stored on the on-ramp row', () => {
    const va = buildVirtualAccount(null, { accountNumber: '111', bankName: 'X Bank', accountName: 'N' }, []);
    expect(va).toMatchObject({ accountNumber: '111', bankName: 'X Bank', accountName: 'N', status: null });
    expect(va.activity).toEqual([]);
  });
  it('an off-ramp shows the Safehaven collection account from its metadata, with what was credited and the forward reference', () => {
    const va = buildVirtualAccount(null, null, [], { accountNumber: '6012748872', accountName: 'Thebuidlgrid Checkout', bankCode: '090286', credited: 2185.78, forwardReference: 'off_2QRK-FWD' });
    expect(va).toMatchObject({ accountNumber: '6012748872', accountName: 'Thebuidlgrid Checkout', bankCode: '090286', credited: '2185.78', forwardReference: 'off_2QRK-FWD' });
  });
  it('on-ramps (no collection metadata) have nothing credited', () => {
    expect(buildVirtualAccount(null, { accountNumber: '1' }, [])).toMatchObject({ credited: null, forwardReference: null });
  });
  it('is null when the transaction has no virtual account (crypto, bridge...)', () => {
    expect(buildVirtualAccount(null, null, [])).toBeNull();
    expect(buildVirtualAccount(null, {}, [])).toBeNull();
  });
});

describe('trace money for off-ramps: naira vs the token sent', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { buildMoney } = require('./transaction-trace.service');
  it('a user off-ramp: amount is naira, the USDC sent comes from the payout leg, settled is the naira paid', () => {
    const row = { amount: '2185.78', fiatAmount: null, tokenType: 'USDC', settledFiatAmount: '2185.78' };
    const m = buildMoney(row, [], 'offramp', [{ role: 'PAYOUT', expectedAmount: '1.5', receivedAmount: null }]);
    expect(m).toMatchObject({ expected: '2185.78', settled: '2185.78', sent: { amount: '1.5', currency: 'USDC' } });
  });
  it('prefers the amount actually received over the expected one, and has no sent when there is no payout leg', () => {
    const row = { amount: '5000.00', fiatAmount: '5000.00', tokenType: 'USDC' };
    expect(buildMoney(row, [], 'offramp', [{ role: 'PAYOUT', expectedAmount: '3.125', receivedAmount: '3.1' }]).sent).toEqual({ amount: '3.1', currency: 'USDC' });
    expect(buildMoney(row, [], 'offramp', []).sent).toBeNull();
  });
  it('a merchant off-ramp keeps the token in amount and the naira in fiat_amount', () => {
    const m = buildMoney({ amount: '1355.00', tokenType: 'CNGN', fiatAmount: '139760.00' }, [], 'merchant_offramp', []);
    expect(m).toMatchObject({ sent: { amount: '1355.00', currency: 'CNGN' }, expected: '139760.00' });
  });
});

describe('tracker sources: off-ramp currency is the payout fiat of the row', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { TRACKER_SOURCES } = require('./tracker.sources');
  const offramp = TRACKER_SOURCES.find((s: any) => s.type === 'offramp');
  it('uses the row currency (KES for a Kenyan payout) and falls back to NGN', () => {
    expect(offramp.currency({ currency: 'KES', tokenType: 'USDC' })).toBe('KES');
    expect(offramp.currency({ currency: 'NGN', tokenType: 'CNGN' })).toBe('NGN');
    expect(offramp.currency({ tokenType: 'USDC' })).toBe('NGN');
  });
  it('shows the fiat amount, not the token', () => {
    expect(offramp.amount({ amount: '2185.78', fiatAmount: null })).toBe('2185.78');
    expect(offramp.amount({ amount: '5', fiatAmount: '5000.00' })).toBe('5000.00');
  });
});
