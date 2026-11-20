import { Prisma } from '@prisma/client';
import { WaitlistService } from './waitlist.service';

const dup = () =>
  new Prisma.PrismaClientKnownRequestError('dup', {
    code: 'P2002',
    clientVersion: 'x',
  });

const profile = {
  email: 'a@b.co',
  name: 'Ada Lovelace',
  phoneNumber: '+2348012345678',
  userType: 'freelancer',
};

describe('WaitlistService', () => {
  const build = (overrides: Record<string, any> = {}) => {
    const prisma = {
      waitlistEntry: {
        create: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
      ...overrides,
    };
    return { prisma, svc: new WaitlistService(prisma as any) };
  };

  it('stores a new email', async () => {
    const { prisma, svc } = build();
    await expect(
      svc.join(
        {
          ...profile,
          source: 'landing',
          phoneCountry: 'NG',
          referrer: 'twitter.com',
          utmSource: 'twitter',
          utmMedium: 'social',
          utmCampaign: 'launch',
        },
        'GH',
      ),
    ).resolves.toMatchObject({ status: 'success' });
    expect(prisma.waitlistEntry.create).toHaveBeenCalledWith({
      data: {
        email: 'a@b.co',
        name: 'Ada Lovelace',
        phoneNumber: '+2348012345678',
        userType: 'freelancer',
        phoneCountry: 'NG',
        country: 'GH',
        referrer: 'twitter.com',
        utmSource: 'twitter',
        utmMedium: 'social',
        utmCampaign: 'launch',
        source: 'landing',
      },
    });
  });

  it('stores null for every optional origin field that is missing', async () => {
    const { prisma, svc } = build();
    await svc.join(profile);
    expect(prisma.waitlistEntry.create).toHaveBeenCalledWith({
      data: {
        email: 'a@b.co',
        name: 'Ada Lovelace',
        phoneNumber: '+2348012345678',
        userType: 'freelancer',
        phoneCountry: null,
        country: null,
        referrer: null,
        utmSource: null,
        utmMedium: null,
        utmCampaign: null,
        source: null,
      },
    });
  });

  it('treats a duplicate email as success without revealing it', async () => {
    const { prisma, svc } = build();
    prisma.waitlistEntry.create.mockRejectedValue(dup());
    const fresh = await build().svc.join(profile);
    await expect(svc.join(profile)).resolves.toEqual(fresh);
  });

  it('lets a repeat signup complete an older incomplete record, without overwriting real data', async () => {
    const { prisma, svc } = build();
    prisma.waitlistEntry.create.mockRejectedValue(dup());
    prisma.waitlistEntry.updateMany.mockResolvedValue({ count: 1 });

    const res = await svc.join(
      {
        ...profile,
        phoneCountry: 'NG',
        referrer: 'twitter.com',
        source: 'waitlist-page',
      },
      'GH',
    );

    expect(res).toMatchObject({ status: 'success' });
    // only rows that still have no name are touched, so a complete record is never overwritten
    expect(prisma.waitlistEntry.updateMany).toHaveBeenCalledWith({
      where: { email: 'a@b.co', name: null },
      data: {
        name: 'Ada Lovelace',
        phoneNumber: '+2348012345678',
        userType: 'freelancer',
        phoneCountry: 'NG',
        country: 'GH',
        referrer: 'twitter.com',
        utmSource: null,
        utmMedium: null,
        utmCampaign: null,
      },
    });
    // the original signup time and page are kept: they are not part of the update
    const data = prisma.waitlistEntry.updateMany.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('email');
    expect(data).not.toHaveProperty('source');
    expect(data).not.toHaveProperty('createdAt');
  });

  it('answers a repeat signup identically whether or not anything was filled in', async () => {
    const complete = build();
    complete.prisma.waitlistEntry.create.mockRejectedValue(dup());
    complete.prisma.waitlistEntry.updateMany.mockResolvedValue({ count: 0 });
    const older = build();
    older.prisma.waitlistEntry.create.mockRejectedValue(dup());
    older.prisma.waitlistEntry.updateMany.mockResolvedValue({ count: 1 });

    expect(await complete.svc.join(profile)).toEqual(
      await older.svc.join(profile),
    );
  });

  it('rethrows unexpected database errors', async () => {
    const { prisma, svc } = build();
    prisma.waitlistEntry.create.mockRejectedValue(new Error('db down'));
    await expect(svc.join(profile)).rejects.toThrow('db down');
  });

  it('paginates newest first and searches case-insensitively', async () => {
    const { prisma, svc } = build();
    prisma.waitlistEntry.count.mockResolvedValue(45);
    const res = await svc.list(2, 20, ' Ada ');
    expect(prisma.waitlistEntry.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { email: { contains: 'Ada', mode: 'insensitive' } },
          { name: { contains: 'Ada', mode: 'insensitive' } },
          { phoneNumber: { contains: 'Ada' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      skip: 20,
      take: 20,
    });
    expect(res.meta).toEqual({ total: 45, page: 2, limit: 20, totalPages: 3 });
  });

  it('zero-fills the signups-per-day series', () => {
    const since = new Date('2026-11-10T00:00:00Z');
    expect(
      WaitlistService.fillSeries([{ date: '2026-11-11', count: 4 }], since, 3),
    ).toEqual([
      { date: '2026-11-10', count: 0 },
      { date: '2026-11-11', count: 4 },
      { date: '2026-11-12', count: 0 },
    ]);
  });

  it('computes the analytics report', async () => {
    const { prisma, svc } = build();
    const t = new Date();
    const todayUtc = new Date(
      Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()),
    );
    prisma.waitlistEntry.count
      .mockResolvedValueOnce(100) // total
      .mockResolvedValueOnce(3); // previous period
    prisma.$queryRaw
      .mockResolvedValueOnce([{ day: todayUtc, count: BigInt(6) }]) // per day
      .mockResolvedValueOnce([{ dow: 2, hour: 14, count: BigInt(4) }]) // heatmap
      .mockResolvedValueOnce([
        { source: 'landing', count: BigInt(5) },
        { source: null, count: BigInt(1) },
      ])
      .mockResolvedValueOnce([
        { type: 'freelancer', count: BigInt(7) },
        { type: 'fintech', count: BigInt(2) },
        { type: null, count: BigInt(1) },
      ]) // by type
      .mockResolvedValueOnce([
        { key: 'NG', count: BigInt(60) },
        { key: 'unknown', count: BigInt(40) },
      ]) // by country
      .mockResolvedValueOnce([
        { key: 'twitter.com', count: BigInt(25) },
        { key: 'direct', count: BigInt(75) },
      ]) // by referrer
      .mockResolvedValueOnce([{ count: BigInt(25) }]); // converted

    const s = await svc.stats(3);

    expect(s).toMatchObject({
      total: 100,
      today: 6,
      inRange: 6,
      averagePerDay: 2,
      days: 3,
      change: { previous: 3, percent: 100 },
      conversion: { registered: 25, total: 100, rate: 25 },
    });
    expect(s.series.map((p) => p.cumulative)).toEqual([94, 94, 100]);
    expect(s.heatmap[2][14]).toBe(4);
    expect(s.bySource).toEqual([
      { source: 'landing', count: 5 },
      { source: 'unknown', count: 1 },
    ]);
    // percent = share of ALL signups (total is 100 here)
    expect(s.byType).toEqual([
      { type: 'crypto_native', count: 0, percent: 0 },
      { type: 'freelancer', count: 7, percent: 7 },
      { type: 'cross_border', count: 0, percent: 0 },
      { type: 'fintech', count: 2, percent: 2 },
      { type: 'unknown', count: 1, percent: 1 },
    ]);
    expect(s.byCountry).toEqual([
      { key: 'NG', count: 60, percent: 60 },
      { key: 'unknown', count: 40, percent: 40 },
    ]);
    expect(s.byReferrer).toEqual([
      { key: 'twitter.com', count: 25, percent: 25 },
      { key: 'direct', count: 75, percent: 75 },
    ]);
  });

  it('withPercent rounds to one decimal and survives a zero total', () => {
    expect(
      WaitlistService.withPercent([{ count: 1 }, { count: 2 }], 3),
    ).toEqual([
      { count: 1, percent: 33.3 },
      { count: 2, percent: 66.7 },
    ]);
    expect(WaitlistService.withPercent([{ count: 0 }], 0)).toEqual([
      { count: 0, percent: 0 },
    ]);
  });

  it('buckets unrecognised or missing types as unknown', () => {
    const b = WaitlistService.buildTypeBreakdown([
      { type: 'something_old', count: 2 },
      { type: null, count: 3 },
    ]);
    expect(b.find((x) => x.type === 'unknown')?.count).toBe(5);
    expect(
      b.filter((x) => x.type !== 'unknown').every((x) => x.count === 0),
    ).toBe(true);
  });

  it('reports no percent change when the previous period was empty', () => {
    expect(WaitlistService.changePercent(5, 0)).toBeNull();
    expect(WaitlistService.changePercent(3, 4)).toBe(-25);
  });

  it('builds a 7x24 heatmap and ignores out-of-range cells', () => {
    const g = WaitlistService.buildHeatmap([
      { dow: 0, hour: 0, count: 2 },
      { dow: 0, hour: 0, count: 1 },
      { dow: 9, hour: 1, count: 5 },
    ]);
    expect(g).toHaveLength(7);
    expect(g[0]).toHaveLength(24);
    expect(g[0][0]).toBe(3);
  });

  it('keeps valid phone numbers intact but still guards odd legacy values', () => {
    expect(WaitlistService.csvPhoneCell('+2348012345678')).toBe(
      '+2348012345678',
    );
    expect(WaitlistService.csvPhoneCell('08012345678')).toBe('08012345678');
    expect(WaitlistService.csvPhoneCell('=1+1')).toBe("'=1+1");
    expect(WaitlistService.csvPhoneCell('')).toBe('');
  });

  it('exports CSV with quoting and formula-injection protection', async () => {
    const { prisma, svc } = build();
    prisma.waitlistEntry.findMany = jest.fn().mockResolvedValue([
      {
        email: '=cmd@x.co',
        name: '+Evil, Name',
        phoneNumber: '+2348012345678',
        userType: 'fintech',
        phoneCountry: 'NG',
        country: 'GH',
        referrer: 'twitter.com',
        utmSource: '=utm',
        utmMedium: null,
        utmCampaign: null,
        source: 'a,b',
        createdAt: new Date('2026-11-10T09:30:00Z'),
      },
      {
        email: 'old@x.co',
        name: null,
        phoneNumber: null,
        userType: null,
        phoneCountry: null,
        country: null,
        referrer: null,
        utmSource: null,
        utmMedium: null,
        utmCampaign: null,
        source: null,
        createdAt: new Date('2026-11-09T09:30:00Z'),
      },
    ]);
    const csv = await svc.exportCsv();
    expect(csv).toBe(
      'email,name,phone,phone_country,type,country,referrer,utm_source,utm_medium,utm_campaign,source,signed_up_at_utc\n' +
        '\'=cmd@x.co,"\'+Evil, Name",+2348012345678,NG,fintech,GH,twitter.com,\'=utm,,,"a,b",2026-11-10T09:30:00.000Z\n' +
        'old@x.co,,,,,,,,,,,2026-11-09T09:30:00.000Z\n',
    );
  });
});
