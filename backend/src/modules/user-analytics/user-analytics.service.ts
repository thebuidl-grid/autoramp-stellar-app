import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;

export const pct = (part: number, whole: number): number =>
  whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;

export const changePercent = (
  current: number,
  previous: number,
): number | null =>
  previous === 0
    ? null
    : Math.round(((current - previous) / previous) * 1000) / 10;

type Kind = 'onramp' | 'offramp' | 'swap';

@Injectable()
export class UserAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Overall user analytics for the admin dashboard (all UTC).
   *
   * Sources: `users` (growth, activity) and the on-ramp / off-ramp / swap
   * transaction tables (engagement). Active-user counts rely on
   * `users.last_active_at`, which is only populated from the deploy that
   * introduced it, so they start low and grow accurate over time.
   */
  async report(days = 30) {
    const now = new Date();
    const todayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const since = new Date(todayStart.getTime() - (days - 1) * DAY_MS);
    const prevSince = new Date(since.getTime() - days * DAY_MS);
    const ago = (d: number) => new Date(now.getTime() - d * DAY_MS);

    const [
      totals,
      previousNew,
      signupRows,
      active,
      funnel,
      byType,
      volume,
      retention,
      activeRows,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({
        where: { createdAt: { gte: prevSince, lt: since } },
      }),
      this.prisma.$queryRaw<{ day: Date; count: bigint }[]>`
        SELECT date_trunc('day', "created_at") AS day, COUNT(*)::bigint AS count
        FROM "users" WHERE "created_at" >= ${since} GROUP BY 1 ORDER BY 1`,
      this.prisma.$queryRaw<{ dau: bigint; wau: bigint; mau: bigint }[]>`
        SELECT
          COUNT(*) FILTER (WHERE "last_active_at" >= ${ago(1)})::bigint AS dau,
          COUNT(*) FILTER (WHERE "last_active_at" >= ${ago(7)})::bigint AS wau,
          COUNT(*) FILTER (WHERE "last_active_at" >= ${ago(30)})::bigint AS mau
        FROM "users"`,
      this.prisma.$queryRaw<
        { attempted: bigint; completed: bigint; repeat: bigint }[]
      >`
        WITH tx AS (
          SELECT "user_id", "status" FROM "onramp_transactions"
          UNION ALL SELECT "user_id", "status" FROM "offramp_transactions"
          UNION ALL SELECT "user_id", "status" FROM "swap_transactions"
        ), per_user AS (
          SELECT "user_id",
                 COUNT(*) AS attempts,
                 COUNT(*) FILTER (WHERE "status" = 'COMPLETED') AS done
          FROM tx GROUP BY "user_id"
        )
        SELECT COUNT(*)::bigint AS attempted,
               COUNT(*) FILTER (WHERE done >= 1)::bigint AS completed,
               COUNT(*) FILTER (WHERE done >= 2)::bigint AS repeat
        FROM per_user`,
      this.prisma.$queryRaw<
        {
          kind: Kind;
          total: bigint;
          completed: bigint;
          failed: bigint;
          users: bigint;
        }[]
      >`
        WITH tx AS (
          SELECT 'onramp' AS kind, "user_id", "status", "created_at" FROM "onramp_transactions"
          UNION ALL SELECT 'offramp', "user_id", "status", "created_at" FROM "offramp_transactions"
          UNION ALL SELECT 'swap', "user_id", "status", "created_at" FROM "swap_transactions"
        )
        SELECT kind,
               COUNT(*)::bigint AS total,
               COUNT(*) FILTER (WHERE "status" = 'COMPLETED')::bigint AS completed,
               COUNT(*) FILTER (WHERE "status" IN ('FAILED','REJECTED','EXPIRED','CANCELLED'))::bigint AS failed,
               COUNT(DISTINCT "user_id")::bigint AS users
        FROM tx WHERE "created_at" >= ${since} GROUP BY kind`,
      // Fiat volume of completed on/off-ramps. Swaps are token-denominated, so they are counted, not summed.
      this.prisma.$queryRaw<{ kind: Kind; currency: string; amount: string }[]>`
        SELECT 'onramp' AS kind, "currency", COALESCE(SUM("amount"), 0)::text AS amount
        FROM "onramp_transactions"
        WHERE "status" = 'COMPLETED' AND "created_at" >= ${since} GROUP BY "currency"
        UNION ALL
        SELECT 'offramp', "currency", COALESCE(SUM("amount"), 0)::text
        FROM "offramp_transactions"
        WHERE "status" = 'COMPLETED' AND "created_at" >= ${since} GROUP BY "currency"`,
      // "Still active after N days": users old enough to be measured whose latest activity is at least N days after signup.
      this.prisma.$queryRaw<
        { n: number; eligible: bigint; retained: bigint }[]
      >`
        SELECT d.n,
               COUNT(*) FILTER (WHERE u."created_at" <= ${now}::timestamp - (d.n || ' days')::interval)::bigint AS eligible,
               COUNT(*) FILTER (
                 WHERE u."created_at" <= ${now}::timestamp - (d.n || ' days')::interval
                   AND u."last_active_at" >= u."created_at" + (d.n || ' days')::interval
               )::bigint AS retained
        FROM "users" u CROSS JOIN (VALUES (1), (7), (30)) AS d(n)
        GROUP BY d.n ORDER BY d.n`,
      // Daily active users over the range, from the transaction tables + activity heartbeat.
      this.prisma.$queryRaw<{ day: Date; users: bigint }[]>`
        WITH events AS (
          SELECT "user_id", "created_at" FROM "onramp_transactions"
          UNION ALL SELECT "user_id", "created_at" FROM "offramp_transactions"
          UNION ALL SELECT "user_id", "created_at" FROM "swap_transactions"
        )
        SELECT date_trunc('day', "created_at") AS day, COUNT(DISTINCT "user_id")::bigint AS users
        FROM events WHERE "created_at" >= ${since} GROUP BY 1 ORDER BY 1`,
    ]);

    const daily = fillDays(
      signupRows.map((r) => ({ date: iso(r.day), count: Number(r.count) })),
      since,
      days,
    );
    const newUsers = daily.reduce((s, p) => s + p.count, 0);
    let running = totals - newUsers;
    const signups = daily.map((p) => ({
      ...p,
      cumulative: (running += p.count),
    }));

    const transactingByDay = new Map(
      activeRows.map((r) => [iso(r.day), Number(r.users)]),
    );
    const transactingSeries = signups.map((p) => ({
      date: p.date,
      users: transactingByDay.get(p.date) ?? 0,
    }));

    const a = active[0] ?? { dau: 0n, wau: 0n, mau: 0n };
    const dau = Number(a.dau);
    const mau = Number(a.mau);
    const f = funnel[0] ?? { attempted: 0n, completed: 0n, repeat: 0n };
    const attempted = Number(f.attempted);
    const completed = Number(f.completed);
    const repeat = Number(f.repeat);

    const typeMap = new Map(byType.map((r) => [r.kind, r]));
    const kinds: Kind[] = ['onramp', 'offramp', 'swap'];

    return {
      days,
      users: {
        total: totals,
        new: newUsers,
        newChange: {
          previous: previousNew,
          percent: changePercent(newUsers, previousNew),
        },
        signups,
      },
      active: {
        dau,
        wau: Number(a.wau),
        mau,
        stickiness: pct(dau, mau),
        transactingPerDay: transactingSeries,
      },
      funnel: [
        { step: 'Registered', count: totals, percent: 100 },
        {
          step: 'Started a transaction',
          count: attempted,
          percent: pct(attempted, totals),
        },
        {
          step: 'Completed a transaction',
          count: completed,
          percent: pct(completed, totals),
        },
        {
          step: 'Repeat user (2+ completed)',
          count: repeat,
          percent: pct(repeat, totals),
        },
      ],
      transactions: kinds.map((kind) => {
        const r = typeMap.get(kind);
        const total = Number(r?.total ?? 0);
        const done = Number(r?.completed ?? 0);
        return {
          kind,
          total,
          completed: done,
          failed: Number(r?.failed ?? 0),
          successRate: pct(done, total),
          users: Number(r?.users ?? 0),
        };
      }),
      volume: volume.map((v) => ({
        kind: v.kind,
        currency: v.currency,
        amount: Number(v.amount),
      })),
      retention: [1, 7, 30].map((n) => {
        const r = retention.find((x) => Number(x.n) === n);
        const eligible = Number(r?.eligible ?? 0);
        const retained = Number(r?.retained ?? 0);
        return { day: n, eligible, retained, percent: pct(retained, eligible) };
      }),
    };
  }
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fillDays(
  rows: { date: string; count: number }[],
  since: Date,
  days: number,
) {
  const byDate = new Map(rows.map((r) => [r.date, r.count]));
  return Array.from({ length: days }, (_, i) => {
    const date = iso(new Date(since.getTime() + i * DAY_MS));
    return { date, count: byDate.get(date) ?? 0 };
  });
}
