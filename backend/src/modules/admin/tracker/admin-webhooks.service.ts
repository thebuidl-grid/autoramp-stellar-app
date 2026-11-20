import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/database/prisma.service';
import { TRACKER_SOURCES } from './tracker.sources';

export interface WebhookFilters {
  provider?: string;
  /** true = tied to one of our transactions, false = tied to nothing we know. */
  matched?: boolean;
  processed?: boolean;
  limit: number;
  offset: number;
}

export interface WebhookRow {
  id: string;
  provider: string | null;
  eventType: string | null;
  status: string | null;
  reference: string;
  transactionType: string;
  transactionId: string;
  processed: boolean;
  errorMessage: string | null;
  legId: string | null;
  inboundWebhookId: string | null;
  createdAt: string;
  matched: boolean;
}

/**
 * SQL that is true when the event's transaction_id is one of our transactions. The table names come from a fixed list, never from
 * input. Detail tables are checked (not the parent rows) because they are complete for new transactions too.
 */
export const MATCHED_SQL = Prisma.raw(
  `(${TRACKER_SOURCES.map((s) => `EXISTS (SELECT 1 FROM ${s.table} d WHERE d.id = w.transaction_id)`).join(' OR ')})`,
);

@Injectable()
export class AdminWebhooksService {
  constructor(private readonly prisma: PrismaService) {}

  private conditions(
    f: Pick<WebhookFilters, 'provider' | 'matched' | 'processed'>,
  ): Prisma.Sql {
    const parts: Prisma.Sql[] = [Prisma.sql`TRUE`];
    if (f.provider)
      parts.push(Prisma.sql`lower(w.provider) = ${f.provider.toLowerCase()}`);
    if (f.processed !== undefined)
      parts.push(Prisma.sql`w.processed = ${f.processed}`);
    if (f.matched === true) parts.push(Prisma.sql`${MATCHED_SQL}`);
    if (f.matched === false) parts.push(Prisma.sql`NOT ${MATCHED_SQL}`);
    return Prisma.join(parts, ' AND ');
  }

  async list(filters: WebhookFilters): Promise<{
    total: number;
    limit: number;
    offset: number;
    items: WebhookRow[];
  }> {
    const where = this.conditions(filters);
    const [rows, totals] = await Promise.all([
      this.prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT * FROM (
          SELECT w.id, w.provider, w.event_type AS "eventType", w.status, w.reference, w.transaction_type::text AS "transactionType",
                 w.transaction_id AS "transactionId", w.processed, w.error_message AS "errorMessage", w.leg_id AS "legId",
                 w.inbound_webhook_id AS "inboundWebhookId", w.created_at AS "createdAt", ${MATCHED_SQL} AS matched
          FROM webhook_events w
          WHERE ${where}
          UNION ALL
          SELECT i.id, i.provider,
                 COALESCE(i.payload->>'event', i.payload->>'type', i.payload->>'eventType', i.payload #>> '{data,event}') AS "eventType",
                 COALESCE(i.payload #>> '{data,status}', i.payload->>'status', i.status) AS status,
                 COALESCE(i.payload #>> '{data,reference}', i.payload #>> '{data,transactionId}', i.payload->>'reference', i.payload->>'transactionId', i.provider_webhook_id, '') AS reference,
                 ''::text AS "transactionType", ''::text AS "transactionId",
                 (i.status = 'completed') AS processed, i.error AS "errorMessage", NULL::uuid AS "legId",
                 i.id AS "inboundWebhookId", i.received_at AS "createdAt", FALSE AS matched
          FROM inbound_webhooks i
          WHERE (${filters.provider ? Prisma.sql`lower(i.provider) = ${filters.provider.toLowerCase()}` : Prisma.sql`TRUE`})
            AND (${filters.matched === true ? Prisma.sql`FALSE` : filters.matched === false ? Prisma.sql`TRUE` : Prisma.sql`TRUE`})
            AND (${filters.processed === undefined ? Prisma.sql`TRUE` : Prisma.sql`(i.status = 'completed') = ${filters.processed}`})
        ) events
        ORDER BY "createdAt" DESC
        LIMIT ${filters.limit} OFFSET ${filters.offset}`),
      this.prisma.$queryRaw<Array<{ n: bigint }>>(Prisma.sql`
        SELECT count(*)::bigint AS n FROM (
          SELECT w.id FROM webhook_events w WHERE ${where}
          UNION ALL
          SELECT i.id FROM inbound_webhooks i
          WHERE (${filters.provider ? Prisma.sql`lower(i.provider) = ${filters.provider.toLowerCase()}` : Prisma.sql`TRUE`})
            AND (${filters.matched === true ? Prisma.sql`FALSE` : Prisma.sql`TRUE`})
            AND (${filters.processed === undefined ? Prisma.sql`TRUE` : Prisma.sql`(i.status = 'completed') = ${filters.processed}`})
        ) events`),
    ]);
    return {
      total: Number(totals[0]?.n ?? 0),
      limit: filters.limit,
      offset: filters.offset,
      items: rows.map((r) => ({
        ...r,
        createdAt: new Date(r.createdAt).toISOString(),
        matched: !!r.matched,
      })),
    };
  }

  /** How many events are tied to nothing we know. Feeds "Needs attention". */
  async countUnmatched(): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ n: bigint }>>(
      Prisma.sql`SELECT count(*)::bigint AS n FROM webhook_events w WHERE NOT ${MATCHED_SQL}`,
    );
    return Number(rows[0]?.n ?? 0);
  }

  /** One event in full: the payload we stored, the raw receipt it came from, and whether it matched. */
  async detail(id: string) {
    const event = await this.prisma.webhookEvent.findUnique({ where: { id } });
    if (!event) {
      const inbound = await this.prisma.inboundWebhook.findUnique({ where: { id } });
      if (!inbound) throw new NotFoundException(`Webhook event ${id} not found`);
      const payload: any = inbound.payload;
      return {
        id: inbound.id,
        provider: inbound.provider,
        eventType: payload?.event ?? payload?.type ?? payload?.eventType ?? payload?.data?.event ?? null,
        status: payload?.data?.status ?? payload?.status ?? inbound.status,
        reference: payload?.data?.reference ?? payload?.data?.transactionId ?? payload?.reference ?? payload?.transactionId ?? inbound.providerWebhookId ?? '',
        transactionType: '',
        transactionId: '',
        processed: inbound.status === 'completed',
        processedAt: inbound.processedAt?.toISOString() ?? null,
        errorMessage: inbound.error ?? null,
        legId: null,
        createdAt: inbound.receivedAt.toISOString(),
        matched: false,
        payload: inbound.payload,
        inbound: {
          id: inbound.id,
          endpoint: inbound.endpoint,
          status: inbound.status,
          error: inbound.error ?? null,
          receivedAt: inbound.receivedAt.toISOString(),
          payload: inbound.payload,
        },
      };
    }

    const [inbound, matchedRows] = await Promise.all([
      event.inboundWebhookId
        ? this.prisma.inboundWebhook.findUnique({
            where: { id: event.inboundWebhookId },
          })
        : null,
      this.prisma.$queryRaw<Array<{ matched: boolean }>>(
        Prisma.sql`SELECT ${MATCHED_SQL} AS matched FROM webhook_events w WHERE w.id = ${id}::uuid`,
      ),
    ]);

    return {
      id: event.id,
      provider: event.provider ?? null,
      eventType: event.eventType ?? null,
      status: event.status ?? null,
      reference: event.reference,
      transactionType: event.transactionType,
      transactionId: event.transactionId,
      processed: event.processed,
      processedAt: event.processedAt ? event.processedAt.toISOString() : null,
      errorMessage: event.errorMessage ?? null,
      legId: event.legId ?? null,
      createdAt: event.createdAt.toISOString(),
      matched: !!matchedRows[0]?.matched,
      payload: event.payload,
      inbound: inbound
        ? {
            id: inbound.id,
            endpoint: inbound.endpoint,
            status: inbound.status,
            error: inbound.error ?? null,
            receivedAt: inbound.receivedAt.toISOString(),
            payload: inbound.payload,
          }
        : null,
    };
  }
}
