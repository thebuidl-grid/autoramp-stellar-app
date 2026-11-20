import {
  UserAnalyticsService,
  changePercent,
  pct,
} from './user-analytics.service';

describe('user-analytics helpers', () => {
  it('pct rounds to one decimal and guards divide-by-zero', () => {
    expect(pct(1, 3)).toBe(33.3);
    expect(pct(5, 0)).toBe(0);
  });

  it('changePercent is null without a baseline', () => {
    expect(changePercent(5, 0)).toBeNull();
    expect(changePercent(3, 4)).toBe(-25);
  });
});

describe('UserAnalyticsService.report', () => {
  const today = new Date();
  const todayUtc = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );

  const build = () => {
    const prisma = {
      user: {
        count: jest
          .fn()
          .mockResolvedValueOnce(10) // total
          .mockResolvedValueOnce(2), // previous period
      },
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ day: todayUtc, count: BigInt(4) }]) // signups
        .mockResolvedValueOnce([
          { dau: BigInt(2), wau: BigInt(5), mau: BigInt(8) },
        ])
        .mockResolvedValueOnce([
          { attempted: BigInt(6), completed: BigInt(4), repeat: BigInt(2) },
        ])
        .mockResolvedValueOnce([
          {
            kind: 'onramp',
            total: BigInt(4),
            completed: BigInt(3),
            failed: BigInt(1),
            users: BigInt(3),
          },
        ])
        .mockResolvedValueOnce([
          { kind: 'onramp', currency: 'NGN', amount: '12000.50' },
        ])
        .mockResolvedValueOnce([
          { n: 1, eligible: BigInt(10), retained: BigInt(5) },
          { n: 7, eligible: BigInt(4), retained: BigInt(1) },
        ])
        .mockResolvedValueOnce([{ day: todayUtc, users: BigInt(3) }]),
    };
    return new UserAnalyticsService(prisma as any);
  };

  it('assembles growth, activity, funnel, transactions, volume and retention', async () => {
    const r = await build().report(3);

    expect(r.users).toMatchObject({
      total: 10,
      new: 4,
      newChange: { previous: 2, percent: 100 },
    });
    expect(r.users.signups.map((p) => p.cumulative)).toEqual([6, 6, 10]);
    expect(r.active).toMatchObject({ dau: 2, wau: 5, mau: 8, stickiness: 25 });
    expect(r.active.transactingPerDay.at(-1)).toEqual({
      date: todayUtc.toISOString().slice(0, 10),
      users: 3,
    });
    expect(r.funnel.map((f) => [f.count, f.percent])).toEqual([
      [10, 100],
      [6, 60],
      [4, 40],
      [2, 20],
    ]);
    expect(r.volume).toEqual([
      { kind: 'onramp', currency: 'NGN', amount: 12000.5 },
    ]);
  });

  it('always returns all three transaction kinds and all retention days', async () => {
    const r = await build().report(3);
    expect(r.transactions.map((t) => t.kind)).toEqual([
      'onramp',
      'offramp',
      'swap',
    ]);
    expect(r.transactions[0]).toMatchObject({ successRate: 75, users: 3 });
    expect(r.transactions[1]).toMatchObject({ total: 0, successRate: 0 });
    expect(r.retention).toEqual([
      { day: 1, eligible: 10, retained: 5, percent: 50 },
      { day: 7, eligible: 4, retained: 1, percent: 25 },
      { day: 30, eligible: 0, retained: 0, percent: 0 },
    ]);
  });
});
