import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { TRACKER_SOURCES, TrackerSource } from './tracker.sources';

export type TimelineKind = 'created' | 'leg' | 'log' | 'webhook';

export interface TimelineEntry {
  /** ISO time. */
  at: string;
  kind: TimelineKind;
  title: string;
  provider?: string | null;
  step?: string | null;
  /** OK | FAILED | RETRY | SKIPPED when the step recorded one. */
  outcome?: string | null;
  from?: string | null;
  to?: string | null;
  description?: string | null;
  legId?: string | null;
  /** Raw detail: log metadata or webhook payload. */
  detail?: unknown;
  webhookEventId?: string;
  processed?: boolean;
  error?: string | null;
}

export interface TraceLeg {
  id: string;
  role: string;
  provider: string;
  providerReference: string | null;
  status: string | null;
  expectedAmount: string | null;
  receivedAmount: string | null;
  outstandingAmount: string | null;
  fundingAddress: string | null;
  depositTxHash: string | null;
  failedStep: string | null;
  failureReason: string | null;
  lastEventAt: string | null;
  createdAt: string;
}

export interface TraceTransaction {
  id: string;
  type: string;
  scope: 'USER' | 'MERCHANT';
  reference: string;
  status: string;
  amount: string | null;
  currency: string | null;
  /** Fiat currency paid to the off-ramp recipient; `currency` remains the source token currency. */
  payoutCurrency: string | null;
  ownerId: string | null;
  /** The network the customer's website was on when this was created: 'mainnet', 'testnet', or null when it was not recorded. */
  chainNetwork: 'mainnet' | 'testnet' | null;
  createdAt: string;
  updatedAt: string | null;
}

/** What was charged and what the customer ended up with. All amounts are decimal strings (no floats). */
export interface TraceMoney {
  fees: Array<{ type: string; amount: string; currency: string }>;
  /** Sum of the fee lines, when they share one currency; the recorded fee column otherwise. */
  feeTotal: { amount: string; currency: string | null } | null;
  /** What we expected to pay out / deliver (the amount after fees were taken). For an off-ramp, in naira. */
  expected: string | null;
  /** What the customer sends, in the token they sent (off-ramps): the payout leg's received amount, else the expected one. */
  sent: { amount: string; currency: string } | null;
  /** What actually settled. Null until it does. */
  settled: string | null;
}

/** Pure: adds decimal strings exactly (BigInt on 8 places). */
export function sumDecimals(values: string[]): string {
  const scale = 8;
  let total = 0n;
  for (const v of values) {
    const [i, f = ''] = String(v).replace('-', '').split('.');
    const n = BigInt(i || '0') * 10n ** BigInt(scale) + BigInt((f + '0'.repeat(scale)).slice(0, scale));
    total += String(v).startsWith('-') ? -n : n;
  }
  const neg = total < 0n;
  const abs = neg ? -total : total;
  const whole = abs / 10n ** BigInt(scale);
  const frac = (abs % 10n ** BigInt(scale)).toString().padStart(scale, '0').replace(/0+$/, '');
  return `${neg ? '-' : ''}${whole}${frac ? '.' + frac : ''}`;
}

/** Pure: what was sent and what was expected, by transaction type. User off-ramps keep naira in `amount`; merchant off-ramps keep the token. */
export function offrampAmounts(type: string, row: any, legs: any[]): { sent: TraceMoney['sent']; expected: string | null } {
  if (type === 'offramp') {
    const payout = legs.find((l) => l.role === 'PAYOUT');
    const token = dec(payout?.receivedAmount) ?? dec(payout?.expectedAmount);
    return {
      sent: token ? { amount: token, currency: String(row.tokenType ?? 'USDC') } : null,
      expected: dec(row.fiatAmount ?? row.amount),
    };
  }
  if (type === 'merchant_offramp') {
    return {
      sent: row.amount != null ? { amount: dec(row.amount)!, currency: String(row.tokenType ?? '') } : null,
      expected: dec(row.fiatAmount),
    };
  }
  return { sent: null, expected: dec(row.fiatAmount) };
}

export function buildMoney(row: any, feeRows: any[], type = '', legs: any[] = []): TraceMoney {
  const fees = feeRows.map((f) => ({ type: String(f.feeType), amount: dec(f.feeAmount)!, currency: String(f.feeCurrency ?? '') }));
  const currencies = new Set(fees.map((f) => f.currency));
  const feeTotal =
    fees.length && currencies.size === 1
      ? { amount: sumDecimals(fees.map((f) => f.amount)), currency: fees[0].currency }
      : row.feeAmount != null
        ? { amount: dec(row.feeAmount)!, currency: row.feeCurrency ?? null }
        : null;
  const { sent, expected } = offrampAmounts(type, row, legs);
  return { fees, feeTotal, expected, sent, settled: dec(row.settledFiatAmount) };
}

/** The Safehaven virtual account created to collect this transaction's payment (NGN), and what has happened on it. */
export interface TraceVirtualAccount {
  accountNumber: string;
  accountName: string | null;
  bankName: string | null;
  bankCode: string | null;
  status: string | null;
  /** Amount the account was created to receive, when it is amount-controlled. */
  expectedAmount: string | null;
  expiresAt: string | null;
  /** Our reference for the account, and Safehaven's. */
  reference: string | null;
  externalReference: string | null;
  createdAt: string | null;
  /** Off-ramps: the naira Safehaven credited to this account, and our reference for forwarding it on to the customer's bank. */
  credited: string | null;
  forwardReference: string | null;
  /** Provider events on this account (credits, transfers), newest first. `transactionId` says which of our transactions each belongs to. */
  activity: Array<{
    id: string;
    eventType: string | null;
    status: string | null;
    processed: boolean;
    transactionId: string | null;
    errorMessage: string | null;
    createdAt: string;
  }>;
}

/** Pure: the account details from the VirtualAccount row, else from the deposit_account JSON the on-ramp stored. */
export function buildVirtualAccount(va: any | null, depositAccount: any | null, activity: any[], collection: any | null = null): TraceVirtualAccount | null {
  // On-ramps keep their account in deposit_account; off-ramps keep the Safehaven collection account in metadata.safehaven.
  const d = depositAccount && typeof depositAccount === 'object' ? depositAccount : collection && typeof collection === 'object' ? collection : null;
  const c = collection && typeof collection === 'object' ? collection : null;
  const accountNumber = va?.accountNumber ?? d?.accountNumber ?? d?.account_number ?? null;
  if (!accountNumber) return null;
  return {
    accountNumber: String(accountNumber),
    accountName: va?.accountName ?? d?.accountName ?? d?.account_name ?? null,
    bankName: va?.bankName ?? d?.bankName ?? d?.bank_name ?? null,
    bankCode: va?.bankCode ?? d?.bankCode ?? d?.bank_code ?? null,
    status: va?.status ? String(va.status) : null,
    expectedAmount: dec(va?.amount),
    expiresAt: iso(va?.expiresAt ?? null),
    reference: va?.reference ?? null,
    externalReference: va?.externalReference ?? null,
    createdAt: iso(va?.createdAt ?? null),
    credited: c?.credited != null ? String(c.credited) : null,
    forwardReference: c?.forwardReference ? String(c.forwardReference) : null,
    activity: activity.map((e) => ({
      id: e.id,
      eventType: e.eventType ?? null,
      status: e.status ?? null,
      processed: !!e.processed,
      transactionId: e.transactionId ?? null,
      errorMessage: e.errorMessage ?? null,
      createdAt: iso(e.createdAt)!,
    })),
  };
}

export interface TraceHalf {
  /** NGN transactions collect payment into a Safehaven virtual account; null when there is none. */
  virtualAccount: TraceVirtualAccount | null;
  money: TraceMoney;
  transaction: TraceTransaction;
  /** The other half of a swap + off-ramp pair (they share a reference). */
  relatedId: string | null;
  /** False for transactions created after the backfill, until parent rows are written live. */
  hasParentRow: boolean;
  legs: TraceLeg[];
  timeline: TimelineEntry[];
  /** Where it went wrong, if it did: a leg's failed step, or the last failed log step. */
  failedAt: {
    step: string;
    provider: string | null;
    reason: string | null;
  } | null;
}

export interface TraceResult {
  reference: string;
  transactions: TraceHalf[];
  /** Webhook events carrying this reference that are not linked to any of the transactions above. */
  unlinkedWebhooks: Array<{
    id: string;
    provider: string | null;
    eventType: string | null;
    status: string | null;
    at: string;
    transactionId: string;
  }>;
}

const KIND_RANK: Record<TimelineKind, number> = {
  created: 0,
  leg: 1,
  log: 2,
  webhook: 3,
};
const iso = (d: Date | string | null | undefined): string | null =>
  d ? new Date(d).toISOString() : null;
const dec = (v: unknown): string | null =>
  v === null || v === undefined ? null : String(v);

/** "status_transition" -> "Status transition". */
export function humanize(value: string | null | undefined): string {
  const words = String(value ?? '')
    .replace(/[_.-]+/g, ' ')
    .trim()
    .toLowerCase();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : '';
}

/** Pure: merges one transaction's records into a single time-ordered list. Exported for tests. */
export function buildTimeline(input: {
  createdAt: Date | string;
  legs: any[];
  logs: any[];
  events: any[];
}): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    { at: iso(input.createdAt)!, kind: 'created', title: 'Created' },
  ];

  for (const leg of input.legs) {
    entries.push({
      at: iso(leg.createdAt)!,
      kind: 'leg',
      title: `${humanize(leg.provider)} ${String(leg.role).toLowerCase()} started`,
      provider: leg.provider,
      legId: leg.id,
    });
    if (leg.failedStep) {
      entries.push({
        at: iso(leg.lastEventAt ?? leg.updatedAt ?? leg.createdAt)!,
        kind: 'leg',
        title: `${humanize(leg.provider)} failed at ${humanize(leg.failedStep).toLowerCase()}`,
        provider: leg.provider,
        step: leg.failedStep,
        outcome: 'FAILED',
        description: leg.failureReason ?? null,
        legId: leg.id,
      });
    }
  }

  for (const log of input.logs) {
    const transition =
      log.oldStatus || log.newStatus
        ? { from: log.oldStatus ?? null, to: log.newStatus ?? null }
        : {};
    const title =
      log.oldStatus && log.newStatus
        ? `${humanize(log.oldStatus)} → ${humanize(log.newStatus)}`
        : log.step
          ? humanize(log.step)
          : humanize(log.action);
    entries.push({
      at: iso(log.createdAt)!,
      kind: 'log',
      title,
      provider: log.provider ?? null,
      step: log.step ?? null,
      outcome: log.outcome ?? null,
      ...transition,
      description: log.description ?? null,
      legId: log.legId ?? null,
      detail: log.metadata ?? undefined,
    });
  }

  for (const ev of input.events) {
    entries.push({
      at: iso(ev.createdAt)!,
      kind: 'webhook',
      title: `${humanize(ev.provider) || 'Webhook'}: ${ev.eventType ?? ev.status ?? 'event'}`,
      provider: ev.provider ?? null,
      to: ev.status ?? null,
      legId: ev.legId ?? null,
      detail: ev.payload ?? undefined,
      webhookEventId: ev.id,
      processed: !!ev.processed,
      error: ev.errorMessage ?? null,
      outcome: ev.errorMessage ? 'FAILED' : null,
    });
  }

  // oldest first; at the same instant keep the natural order (created, leg, log, webhook)
  return entries
    .map((e, i) => ({ e, i }))
    .sort(
      (a, b) =>
        a.e.at.localeCompare(b.e.at) ||
        KIND_RANK[a.e.kind] - KIND_RANK[b.e.kind] ||
        a.i - b.i,
    )
    .map(({ e }) => e);
}

/** Pure: where did it go wrong? Leg failure wins (it names the provider), else the last log that failed. */
export function findFailure(legs: any[], logs: any[]): TraceHalf['failedAt'] {
  const leg = [...legs].reverse().find((l) => l.failedStep);
  if (leg)
    return {
      step: leg.failedStep,
      provider: leg.provider ?? null,
      reason: leg.failureReason ?? null,
    };
  const log = [...logs].reverse().find((l) => l.outcome === 'FAILED');
  if (log)
    return {
      step: log.step ?? log.action,
      provider: log.provider ?? null,
      reason: log.description ?? null,
    };
  return null;
}

@Injectable()
export class TransactionTraceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Safehaven events on one virtual account. They name the account in the payload (credit or debit side), not in the reference
   * column, so match there. Newest first, capped. Without raw SQL support (tests) this is simply empty.
   */
  private async accountActivity(accountNumber: string): Promise<any[]> {
    const prisma: any = this.prisma;
    if (typeof prisma.$queryRaw !== 'function') return [];
    const rows: any[] = await prisma.$queryRaw`
      SELECT id, event_type AS "eventType", status, processed, transaction_id AS "transactionId",
             error_message AS "errorMessage", created_at AS "createdAt"
      FROM webhook_events
      WHERE provider = 'safehaven'
        AND (COALESCE(payload->'data'->>'creditAccountNumber', payload->>'creditAccountNumber') = ${accountNumber}
          OR COALESCE(payload->'data'->>'debitAccountNumber', payload->>'debitAccountNumber') = ${accountNumber})
      ORDER BY created_at DESC
      LIMIT 50`;
    return rows;
  }

  private db(name: string): any {
    return (this.prisma as any)[name];
  }

  /** Every transaction with this reference. A crypto-to-fiat swap and its fiat off-ramp share one, so there can be two. */
  private async findTransactions(
    reference: string,
  ): Promise<Array<{ source: TrackerSource; row: any }>> {
    const found = await Promise.all(
      TRACKER_SOURCES.map(async (source) => {
        const rows = await this.db(source.model).findMany({
          where: { reference },
        });
        return rows.map((row: any) => ({ source, row }));
      }),
    );
    return found.flat();
  }

  async trace(rawReference: string): Promise<TraceResult> {
    const reference = String(rawReference ?? '').trim();
    if (!reference) throw new NotFoundException('A reference is required');

    const hits = await this.findTransactions(reference);
    const ids = hits.map((h) => h.row.id as string);

    const [parents, merchantParents, unlinked] = await Promise.all([
      ids.length
        ? this.db('transaction').findMany({ where: { id: { in: ids } } })
        : [],
      ids.length
        ? this.db('merchantTransaction').findMany({
            where: { id: { in: ids } },
          })
        : [],
      this.db('webhookEvent').findMany({
        where: {
          reference,
          ...(ids.length ? { transactionId: { notIn: ids } } : {}),
        },
        orderBy: { createdAt: 'asc' },
        take: 100,
      }),
    ]);
    const parentById = new Map<string, any>(
      [...parents, ...merchantParents].map((p: any) => [p.id, p]),
    );

    if (hits.length === 0 && unlinked.length === 0) {
      throw new NotFoundException(
        `No transaction or webhook event found for reference ${reference}`,
      );
    }

    const halves = await Promise.all(
      hits.map(async ({ source, row }): Promise<TraceHalf> => {
        const [legs, logs, events, feeRows, vaRow] = await Promise.all([
          this.db('transactionLeg').findMany({
            where: { transactionId: row.id },
            orderBy: { createdAt: 'asc' },
          }),
          this.db('transactionLog').findMany({
            where: { transactionId: row.id },
            orderBy: { createdAt: 'asc' },
            take: 500,
          }),
          this.db('webhookEvent').findMany({
            where: { transactionId: row.id },
            orderBy: { createdAt: 'asc' },
            take: 200,
          }),
          this.db('transactionFee').findMany({
            where: { transactionId: row.id },
            orderBy: { createdAt: 'asc' },
          }),
          this.db('virtualAccount').findFirst({
            where: { transactionId: row.id },
            orderBy: { createdAt: 'desc' },
          }),
        ]);
        const collection = row.metadata?.safehaven ?? null;
        const accountNumber = vaRow?.accountNumber ?? row.depositAccount?.accountNumber ?? collection?.accountNumber ?? null;
        const vaActivity = accountNumber ? await this.accountActivity(String(accountNumber)) : [];
        const parent = parentById.get(row.id);
        return {
          transaction: {
            id: row.id,
            type: source.type,
            scope: source.scope,
            reference: row.reference,
            status: String(row.status),
            amount: source.amount(row),
            currency: source.currency(row),
            payoutCurrency: source.type.includes('offramp') ? dec(row.currency) : null,
            ownerId: row[source.owner] ?? null,
            chainNetwork: row.chainNetwork === 'mainnet' || row.chainNetwork === 'testnet' ? row.chainNetwork : null,
            createdAt: iso(row.createdAt)!,
            updatedAt: iso(row.updatedAt),
          },
          virtualAccount: buildVirtualAccount(vaRow, row.depositAccount ?? null, vaActivity, collection),
          money: buildMoney(row, feeRows, source.type, legs),
          relatedId: parent?.relatedId ?? null,
          hasParentRow: !!parent,
          legs: legs.map(
            (l: any): TraceLeg => ({
              id: l.id,
              role: l.role,
              provider: l.provider,
              providerReference: l.providerReference ?? null,
              status: l.status ?? null,
              expectedAmount: dec(l.expectedAmount),
              receivedAmount: dec(l.receivedAmount),
              outstandingAmount: dec(l.outstandingAmount),
              fundingAddress: l.fundingAddress ?? null,
              depositTxHash: l.depositTxHash ?? null,
              failedStep: l.failedStep ?? null,
              failureReason: l.failureReason ?? null,
              lastEventAt: iso(l.lastEventAt),
              createdAt: iso(l.createdAt)!,
            }),
          ),
          timeline: buildTimeline({
            createdAt: row.createdAt,
            legs,
            logs,
            events,
          }),
          failedAt: findFailure(legs, logs),
        };
      }),
    );

    return {
      reference,
      transactions: halves,
      unlinkedWebhooks: unlinked.map((e: any) => ({
        id: e.id,
        provider: e.provider ?? null,
        eventType: e.eventType ?? null,
        status: e.status ?? null,
        at: iso(e.createdAt)!,
        transactionId: e.transactionId,
      })),
    };
  }
}
