import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { JoinWaitlistDto } from './dto/join-waitlist.dto';
import { WAITLIST_USER_TYPES } from './waitlist.constants';

export interface WaitlistSeriesPoint {
  date: string; // YYYY-MM-DD (UTC)
  count: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class WaitlistService {
  private readonly logger = new Logger(WaitlistService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Idempotent: joining twice is a success. The response never reveals
   * whether an email was already on the list (no enumeration).
   */
  async join(
    dto: JoinWaitlistDto,
    country: string | null = null,
  ): Promise<{ status: 'success'; message: string }> {
    const profile = {
      name: dto.name,
      phoneNumber: dto.phoneNumber,
      userType: dto.userType,
      phoneCountry: dto.phoneCountry ?? null,
      country,
      referrer: dto.referrer ?? null,
      utmSource: dto.utmSource ?? null,
      utmMedium: dto.utmMedium ?? null,
      utmCampaign: dto.utmCampaign ?? null,
    };
    try {
      await this.prisma.waitlistEntry.create({
        data: { email: dto.email, ...profile, source: dto.source ?? null },
      });
    } catch (error) {
      if (
        !(
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        )
      ) {
        throw error;
      }
      // Already on the list. Never overwrite details that exist, but an older signup made before
      // name/phone/type were collected has name = null: let a repeat signup complete it, so the
      // person is not stuck with an empty record. The response is identical either way.
      const { count } = await this.prisma.waitlistEntry.updateMany({
        where: { email: dto.email, name: null },
        data: profile,
      });
      this.logger.debug(
        count
          ? 'Completed the details of an older waitlist signup'
          : 'Waitlist signup for existing email ignored',
      );
    }
    return {
      status: 'success',
      message: "You're on the list. We'll be in touch.",
    };
  }

  async list(page = 1, limit = 20, search?: string) {
    const term = search?.trim();
    const where: Prisma.WaitlistEntryWhereInput = term
      ? {
          OR: [
            { email: { contains: term, mode: 'insensitive' } },
            { name: { contains: term, mode: 'insensitive' } },
            { phoneNumber: { contains: term } },
          ],
        }
      : {};
    const [items, total] = await Promise.all([
      this.prisma.waitlistEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.waitlistEntry.count({ where }),
    ]);
    return {
      data: items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  /**
   * Analytics report for the admin dashboard. Everything is computed in UTC.
   * - series: signups per day (zero-filled) plus a running cumulative total
   * - change: this range vs. the immediately preceding range of equal length
   * - heatmap: signups by weekday (0 = Sunday) x hour of day within the range
   * - bySource: signups per source within the range
   * - byType: all-time signups per user type (crypto_native, freelancer, cross_border, fintech, unknown), with percent of all signups
   * - byCountry / byReferrer: all-time top 15 visitor countries and referring hostnames ('unknown' / 'direct' when missing), with percent
   * - conversion: all-time share of waitlist emails that have since registered
   */
  async stats(days = 30) {
    const now = new Date();
    const todayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const since = new Date(todayStart.getTime() - (days - 1) * DAY_MS);
    const prevSince = new Date(since.getTime() - days * DAY_MS);

    const [
      total,
      previous,
      dayRows,
      heatRows,
      sourceRows,
      typeRows,
      countryRows,
      referrerRows,
      converted,
    ] = await Promise.all([
      this.prisma.waitlistEntry.count(),
      this.prisma.waitlistEntry.count({
        where: { createdAt: { gte: prevSince, lt: since } },
      }),
      this.prisma.$queryRaw<{ day: Date; count: bigint }[]>`
          SELECT date_trunc('day', "created_at") AS day, COUNT(*)::bigint AS count
          FROM "waitlist_entries"
          WHERE "created_at" >= ${since}
          GROUP BY 1
          ORDER BY 1`,
      this.prisma.$queryRaw<{ dow: number; hour: number; count: bigint }[]>`
          SELECT EXTRACT(DOW FROM "created_at")::int AS dow,
                 EXTRACT(HOUR FROM "created_at")::int AS hour,
                 COUNT(*)::bigint AS count
          FROM "waitlist_entries"
          WHERE "created_at" >= ${since}
          GROUP BY 1, 2`,
      this.prisma.$queryRaw<{ source: string | null; count: bigint }[]>`
          SELECT "source", COUNT(*)::bigint AS count
          FROM "waitlist_entries"
          WHERE "created_at" >= ${since}
          GROUP BY 1
          ORDER BY 2 DESC`,
      this.prisma.$queryRaw<{ type: string | null; count: bigint }[]>`
          SELECT "user_type" AS type, COUNT(*)::bigint AS count
          FROM "waitlist_entries"
          GROUP BY 1`,
      this.prisma.$queryRaw<{ key: string; count: bigint }[]>`
          SELECT COALESCE("country", 'unknown') AS key, COUNT(*)::bigint AS count
          FROM "waitlist_entries"
          GROUP BY 1
          ORDER BY 2 DESC
          LIMIT 15`,
      this.prisma.$queryRaw<{ key: string; count: bigint }[]>`
          SELECT COALESCE("referrer", 'direct') AS key, COUNT(*)::bigint AS count
          FROM "waitlist_entries"
          GROUP BY 1
          ORDER BY 2 DESC
          LIMIT 15`,
      this.prisma.$queryRaw<{ count: bigint }[]>`
          SELECT COUNT(*)::bigint AS count
          FROM "waitlist_entries" w
          WHERE EXISTS (SELECT 1 FROM "users" u WHERE lower(u."email") = w."email")`,
    ]);

    const daily = WaitlistService.fillSeries(
      dayRows.map((r) => ({
        date: r.day.toISOString().slice(0, 10),
        count: Number(r.count),
      })),
      since,
      days,
    );
    const inRange = daily.reduce((sum, p) => sum + p.count, 0);
    let running = total - inRange;
    const series = daily.map((p) => ({
      ...p,
      cumulative: (running += p.count),
    }));

    const registered = Number(converted[0]?.count ?? 0);
    return {
      total,
      today: series[series.length - 1]?.count ?? 0,
      inRange,
      averagePerDay: Math.round((inRange / days) * 100) / 100,
      days,
      change: {
        previous,
        percent: WaitlistService.changePercent(inRange, previous),
      },
      series,
      heatmap: WaitlistService.buildHeatmap(
        heatRows.map((r) => ({ ...r, count: Number(r.count) })),
      ),
      bySource: sourceRows.map((r) => ({
        source: r.source ?? 'unknown',
        count: Number(r.count),
      })),
      byType: WaitlistService.withPercent(
        WaitlistService.buildTypeBreakdown(
          typeRows.map((r) => ({ type: r.type, count: Number(r.count) })),
        ),
        total,
      ),
      byCountry: WaitlistService.withPercent(
        countryRows.map((r) => ({ key: r.key, count: Number(r.count) })),
        total,
      ),
      byReferrer: WaitlistService.withPercent(
        referrerRows.map((r) => ({ key: r.key, count: Number(r.count) })),
        total,
      ),
      conversion: {
        registered,
        total,
        rate: total ? Math.round((registered / total) * 1000) / 10 : 0,
      },
    };
  }

  /** CSV of every signup (oldest first), safe against spreadsheet formula injection. */
  async exportCsv(): Promise<string> {
    const rows = await this.prisma.waitlistEntry.findMany({
      orderBy: { createdAt: 'asc' },
      take: 100_000,
    });
    const lines = rows.map((r) =>
      [
        WaitlistService.csvCell(r.email),
        WaitlistService.csvCell(r.name ?? ''),
        WaitlistService.csvPhoneCell(r.phoneNumber ?? ''),
        WaitlistService.csvCell(r.phoneCountry ?? ''),
        WaitlistService.csvCell(r.userType ?? ''),
        WaitlistService.csvCell(r.country ?? ''),
        WaitlistService.csvCell(r.referrer ?? ''),
        WaitlistService.csvCell(r.utmSource ?? ''),
        WaitlistService.csvCell(r.utmMedium ?? ''),
        WaitlistService.csvCell(r.utmCampaign ?? ''),
        WaitlistService.csvCell(r.source ?? ''),
        WaitlistService.csvCell(r.createdAt.toISOString()),
      ].join(','),
    );
    return (
      [
        'email,name,phone,phone_country,type,country,referrer,utm_source,utm_medium,utm_campaign,source,signed_up_at_utc',
        ...lines,
      ].join('\n') + '\n'
    );
  }

  /**
   * Phone numbers are validated as digits with an optional leading "+", so they cannot carry a
   * formula. Keep that shape intact (no apostrophe); anything else still goes through csvCell.
   */
  static csvPhoneCell(value: string): string {
    return /^\+?[0-9]+$/.test(value) ? value : WaitlistService.csvCell(value);
  }

  static csvCell(value: string): string {
    // Neutralise =, +, -, @ (and tab/CR) leading characters so Excel/Sheets don't run them.
    const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  }

  /** Adds `percent` (share of all signups, one decimal) to each row. */
  static withPercent<T extends { count: number }>(
    rows: T[],
    total: number,
  ): (T & { percent: number })[] {
    return rows.map((r) => ({
      ...r,
      percent: total ? Math.round((r.count / total) * 1000) / 10 : 0,
    }));
  }

  /** All four types always present (zero-filled), plus `unknown` for signups made before types existed. */
  static buildTypeBreakdown(
    rows: { type: string | null; count: number }[],
  ): { type: string; count: number }[] {
    const known = new Map<string, number>(
      WAITLIST_USER_TYPES.map((t) => [t, 0]),
    );
    let unknown = 0;
    for (const r of rows) {
      if (r.type && known.has(r.type)) {
        known.set(r.type, (known.get(r.type) ?? 0) + r.count);
      } else {
        unknown += r.count;
      }
    }
    return [
      ...[...known].map(([type, count]) => ({ type, count })),
      { type: 'unknown', count: unknown },
    ];
  }

  /** Percent change vs. the previous period; null when there is no baseline. */
  static changePercent(current: number, previous: number): number | null {
    if (previous === 0) return null;
    return Math.round(((current - previous) / previous) * 1000) / 10;
  }

  /** 7 (Sun..Sat) x 24 (UTC hour) matrix of counts. */
  static buildHeatmap(
    rows: { dow: number; hour: number; count: number }[],
  ): number[][] {
    const grid = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
    for (const r of rows) {
      if (r.dow >= 0 && r.dow < 7 && r.hour >= 0 && r.hour < 24) {
        grid[r.dow][r.hour] += r.count;
      }
    }
    return grid;
  }

  static fillSeries(
    rows: WaitlistSeriesPoint[],
    since: Date,
    days: number,
  ): WaitlistSeriesPoint[] {
    const byDate = new Map(rows.map((r) => [r.date, r.count]));
    return Array.from({ length: days }, (_, i) => {
      const date = new Date(since.getTime() + i * DAY_MS)
        .toISOString()
        .slice(0, 10);
      return { date, count: byDate.get(date) ?? 0 };
    });
  }
}
