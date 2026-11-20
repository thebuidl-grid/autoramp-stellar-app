import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { ACCOUNTS_SQL, ACCOUNT_EVENTS_SQL, CCTP_SQL, TRANSACTIONS_SQL, kindsFor } from './safehaven-queries';

export interface Page<T> {
  total: number;
  limit: number;
  offset: number;
  items: T[];
}

/** `%text%` for ILIKE with the wildcard characters in the text escaped, or null for no search. The text is always bound, never inlined. */
export function likePattern(q: string | undefined): string | null {
  const t = (q ?? '').trim();
  if (!t) return null;
  return `%${t.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

const clampLimit = (n?: number) => Math.min(Math.max(n ?? 25, 1), 100);
const clampOffset = (n?: number) => Math.max(n ?? 0, 0);

/**
 * Admin views of Safehaven (accounts, money in and out) and CCTP bridge transfers. Read-only. The SQL lives in safehaven-queries.ts.
 */
@Injectable()
export class AdminSafehavenService {
  constructor(private readonly prisma: PrismaService) {}

  private async run<T = any>(sql: string, ...params: unknown[]): Promise<T[]> {
    return (this.prisma as any).$queryRawUnsafe(sql, ...params) as Promise<T[]>;
  }

  private page<T extends { total?: number }>(rows: T[], limit: number, offset: number): Page<Omit<T, 'total'>> {
    const total = rows[0]?.total ?? 0;
    return { total, limit, offset, items: rows.map(({ total: _t, ...rest }) => rest) as Array<Omit<T, 'total'>> };
  }

  async accounts(query: { kind?: string; q?: string; limit?: number; offset?: number }) {
    const limit = clampLimit(query.limit);
    const offset = clampOffset(query.offset);
    const rows = await this.run(ACCOUNTS_SQL, kindsFor(query.kind), likePattern(query.q), limit, offset);
    return this.page(rows, limit, offset);
  }

  /** One account with the events on it. 404 when no account has that number. */
  async account(accountNumber: string) {
    const exact = accountNumber.replace(/[\\%_]/g, (c) => `\\${c}`);
    const rows = await this.run(ACCOUNTS_SQL, null, exact, 1, 0);
    const found = rows.find((r: any) => r.accountNumber === accountNumber);
    if (!found) throw new NotFoundException(`No Safehaven account ${accountNumber}`);
    const events = await this.run(ACCOUNT_EVENTS_SQL, accountNumber);
    const { total: _t, ...account } = found;
    return { account, events };
  }

  async transactions(query: { status?: string; matched?: boolean; q?: string; limit?: number; offset?: number }) {
    const limit = clampLimit(query.limit);
    const offset = clampOffset(query.offset);
    const rows = await this.run(
      TRANSACTIONS_SQL,
      query.status ? query.status.trim() : null,
      typeof query.matched === 'boolean' ? query.matched : null,
      likePattern(query.q),
      limit,
      offset,
    );
    return this.page(rows, limit, offset);
  }

  async cctp(query: { status?: string; q?: string; limit?: number; offset?: number }) {
    const limit = clampLimit(query.limit);
    const offset = clampOffset(query.offset);
    const rows = await this.run(CCTP_SQL, query.status ? query.status.trim() : null, likePattern(query.q), limit, offset);
    return this.page(rows, limit, offset);
  }
}
