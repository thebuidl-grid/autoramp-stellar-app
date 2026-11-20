import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import {
  FAILED_STATUSES,
  OPEN_STATUSES,
  TRACKER_SOURCES,
  stuckMaxAgeDays,
  stuckThresholdMinutes,
} from './tracker.sources';

export interface HealthFilters {
  /** One of the types in TRACKER_SOURCES (onramp, offramp, swap, otc, bridge, merchant_*, vas). */
  type?: string;
  provider?: string;
  /** Only stuck: ignore the per-status limits and use this many minutes. */
  olderThanMinutes?: number;
  /** Only stuck: also list ones untouched for more than STUCK_MAX_AGE_DAYS (abandoned). */
  includeAbandoned?: boolean;
  limit: number;
  offset: number;
}

export interface HealthRow {
  id: string;
  reference: string;
  type: string;
  status: string;
  amount: string | null;
  currency: string | null;
  ownerId: string | null;
  createdAt: string;
  updatedAt: string;
  /** Minutes since it last changed. */
  ageMinutes: number;
  /** The last thing we recorded about it: the step, or the status change. */
  lastStep: string | null;
  providers: Array<{
    provider: string;
    role: string;
    status: string | null;
    failedStep: string | null;
    failureReason: string | null;
  }>;
}

export interface HealthPage {
  total: number;
  limit: number;
  offset: number;
  items: HealthRow[];
}

export interface AttentionCounts {
  failed: number;
  stuck: number;
  unmatchedWebhooks: number;
}

/**
 * Pure: the Prisma `where` for stuck rows: an open status that has not changed for longer than its limit, but recently enough to
 * still matter (see stuckMaxAgeDays). Pass includeAbandoned to drop the recency bound.
 */
export function stuckWhere(
  now: Date,
  olderThanMinutes?: number,
  env: Record<string, string | undefined> = process.env,
  includeAbandoned = false,
) {
  const oldest = new Date(now.getTime() - stuckMaxAgeDays(env) * 86_400_000);
  return {
    OR: OPEN_STATUSES.map((status) => ({
      status,
      updatedAt: {
        lt: new Date(
          now.getTime() -
            (olderThanMinutes ?? stuckThresholdMinutes(status, env)) * 60_000,
        ),
        ...(includeAbandoned ? {} : { gt: oldest }),
      },
    })),
  };
}

@Injectable()
export class TransactionHealthService {
  constructor(private readonly prisma: PrismaService) {}

  private db(name: string): any {
    return (this.prisma as any)[name];
  }

  private sources(type?: string) {
    return type
      ? TRACKER_SOURCES.filter((s) => s.type === type)
      : TRACKER_SOURCES;
  }

  private where(
    kind: 'stuck' | 'failed',
    filters: Pick<HealthFilters, 'olderThanMinutes' | 'includeAbandoned'>,
    now: Date,
  ) {
    return kind === 'failed'
      ? { status: { in: [...FAILED_STATUSES] } }
      : stuckWhere(
          now,
          filters.olderThanMinutes,
          process.env,
          filters.includeAbandoned,
        );
  }

  /** The list behind "stuck" and "failed". Merged across every transaction table, oldest stuck first / newest failure first. */
  async list(
    kind: 'stuck' | 'failed',
    filters: HealthFilters,
    now = new Date(),
  ): Promise<HealthPage> {
    const where = this.where(kind, filters, now);
    const orderBy = { updatedAt: kind === 'stuck' ? 'asc' : 'desc' } as const;
    const sources = this.sources(filters.type);

    const per = await Promise.all(
      sources.map(async (source) => {
        const [total, rows] = await Promise.all([
          this.db(source.model).count({ where }),
          this.db(source.model).findMany({
            where,
            orderBy,
            take: filters.offset + filters.limit,
          }),
        ]);
        return { source, total, rows };
      }),
    );

    const merged = per
      .flatMap(({ source, rows }) => rows.map((row: any) => ({ source, row })))
      .sort(
        (a, b) =>
          (kind === 'stuck' ? 1 : -1) *
          (new Date(a.row.updatedAt).getTime() -
            new Date(b.row.updatedAt).getTime()),
      );

    let slice = merged.slice(filters.offset, filters.offset + filters.limit);
    let total = per.reduce((n, p) => n + p.total, 0);

    // A provider filter needs the legs, so it is applied after loading them for this page's candidates.
    const ids = slice.map(({ row }) => row.id as string);
    const [legs, logs] = await Promise.all([
      ids.length
        ? this.db('transactionLeg').findMany({
            where: { transactionId: { in: ids } },
            orderBy: { createdAt: 'asc' },
          })
        : [],
      ids.length
        ? this.db('transactionLog').findMany({
            where: { transactionId: { in: ids } },
            orderBy: { createdAt: 'desc' },
          })
        : [],
    ]);
    const legsBy = groupBy(legs, (l: any) => l.transactionId);
    const lastLogBy = new Map<string, any>();
    for (const l of logs)
      if (!lastLogBy.has(l.transactionId)) lastLogBy.set(l.transactionId, l);

    if (filters.provider) {
      const wanted = filters.provider.toUpperCase();
      const before = slice.length;
      slice = slice.filter(({ row }) =>
        (legsBy.get(row.id) ?? []).some(
          (l: any) => String(l.provider).toUpperCase() === wanted,
        ),
      );
      if (before !== slice.length)
        total = Math.max(slice.length, total - (before - slice.length)); // an estimate: the filter only sees this page
    }

    const items = slice.map(({ source, row }): HealthRow => {
      const log = lastLogBy.get(row.id);
      return {
        id: row.id,
        reference: row.reference,
        type: source.type,
        status: String(row.status),
        amount: source.amount(row),
        currency: source.currency(row),
        ownerId: row[source.owner] ?? null,
        createdAt: new Date(row.createdAt).toISOString(),
        updatedAt: new Date(row.updatedAt).toISOString(),
        ageMinutes: Math.max(
          0,
          Math.round(
            (now.getTime() - new Date(row.updatedAt).getTime()) / 60_000,
          ),
        ),
        lastStep: log
          ? (log.step ??
            (log.newStatus
              ? `${log.oldStatus ?? '?'} → ${log.newStatus}`
              : log.action))
          : null,
        providers: (legsBy.get(row.id) ?? []).map((l: any) => ({
          provider: l.provider,
          role: l.role,
          status: l.status ?? null,
          failedStep: l.failedStep ?? null,
          failureReason: l.failureReason ?? null,
        })),
      };
    });

    return { total, limit: filters.limit, offset: filters.offset, items };
  }

  /** Counts for the dashboard's "Needs attention" list. Webhook counting lives in AdminWebhooksService. */
  async counts(
    now = new Date(),
  ): Promise<Pick<AttentionCounts, 'failed' | 'stuck'>> {
    const count = async (kind: 'stuck' | 'failed') => {
      const where = this.where(kind, {}, now);
      const totals = await Promise.all(
        TRACKER_SOURCES.map((s) => this.db(s.model).count({ where })),
      );
      return totals.reduce((a: number, b: number) => a + b, 0);
    };
    const [failed, stuck] = await Promise.all([
      count('failed'),
      count('stuck'),
    ]);
    return { failed, stuck };
  }
}

function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    map.set(k, [...(map.get(k) ?? []), item]);
  }
  return map;
}
