"use client";

import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { RefreshCw } from "lucide-react";
import { CopyableId, DataTable, DetailList, FilterBar, PageHeader, Pagination, ProviderBadge, SegmentedTabs, SelectField, SidePanel, StatusBadge, type Column } from "@/components/ui-shared";
import { isAutoRampReference } from "@/lib/bitnob-format";
import { errorMessage, useWebhook, useWebhooks } from "@/lib/hooks/use-admin-tracker";
import { traceUrl, type WebhookRow } from "@/lib/tracker";

const TABS = [
  { value: "all", label: "All events" },
  { value: "unmatched", label: "Not matched" },
  { value: "unprocessed", label: "Not processed" },
];

const PROVIDERS = [
  { value: "", label: "All providers" },
  { value: "safehaven", label: "Safehaven" },
  { value: "bitnob", label: "Bitnob" },
  { value: "flint", label: "Flint" },
  { value: "pulse", label: "Pulse MFB" },
  { value: "blockradar", label: "Blockradar" },
];

function Json({ value }: { value: unknown }) {
  return <pre className="max-h-72 overflow-auto rounded-(--c-radius) bg-(--c-field) p-2 text-xs">{JSON.stringify(value, null, 2)}</pre>;
}

function WebhookPanel({ id, onClose }: { id: string | null; onClose: () => void }) {
  const detail = useWebhook(id);
  const e = detail.data;
  return (
    <SidePanel open={!!id} onOpenChange={(o) => !o && onClose()} title={e ? `${e.eventType ?? "Webhook event"}` : "Webhook event"} description={e ? format(new Date(e.createdAt), "MMM d, yyyy HH:mm:ss") : undefined}>
      {detail.isLoading ? (
        <div role="status" aria-label="Loading event" className="h-24 animate-pulse rounded-(--c-radius) bg-(--c-field) motion-reduce:animate-none" />
      ) : detail.isError ? (
        <p role="alert" className="text-(--c-danger)">
          Couldn&apos;t load this event: {errorMessage(detail.error)}
        </p>
      ) : e ? (
        <div className="space-y-5">
          <DetailList
            items={[
              { label: "Provider", value: <ProviderBadge provider={e.provider} /> },
              { label: "Matched", value: e.matched ? "To one of our transactions" : <span className="text-(--c-warn)">No — it points at nothing we know</span> },
              { label: "Processed", value: e.processed ? "Yes" : <span className="text-(--c-warn)">No</span> },
              ...(e.errorMessage ? [{ label: "Error", value: <span className="text-(--c-danger)">{e.errorMessage}</span> }] : []),
              { label: "Reference", value: <CopyableId value={e.reference} label="reference" /> },
              { label: "Transaction id", value: <CopyableId value={e.transactionId} label="transaction id" /> },
              { label: "Event id", value: <CopyableId value={e.id} label="event id" /> },
            ]}
          />
          {isAutoRampReference(e.reference) ? (
            <Link href={traceUrl(e.reference)} className="inline-block rounded-(--c-radius) bg-(--c-signal) px-3 py-1.5 font-medium text-(--c-signal-ink) hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--c-signal)">
              Trace this transaction
            </Link>
          ) : null}
          <section className="space-y-1">
            <h3 className="font-medium">Stored payload</h3>
            <Json value={e.payload} />
          </section>
          {e.inbound ? (
            <section className="space-y-1">
              <h3 className="font-medium">Raw receipt</h3>
              <p className="text-xs text-(--c-muted)">
                {e.inbound.endpoint} · {e.inbound.status} · {format(new Date(e.inbound.receivedAt), "MMM d, HH:mm:ss")}
              </p>
              <Json value={e.inbound.payload} />
            </section>
          ) : null}
        </div>
      ) : null}
    </SidePanel>
  );
}

/** Provider events as we received them, and the ones that tie to no transaction. */
export default function AdminWebhooksPage() {
  const [tab, setTab] = useState("all");
  const [provider, setProvider] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState<string | null>(null);

  const list = useWebhooks({
    provider: provider || undefined,
    matched: tab === "unmatched" ? false : undefined,
    processed: tab === "unprocessed" ? false : undefined,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  const columns: Column<WebhookRow>[] = [
    { key: "when", header: "When", cell: (w) => <span className="text-(--c-muted)" title={w.createdAt}>{format(new Date(w.createdAt), "MMM d, HH:mm")}</span>, className: "whitespace-nowrap" },
    { key: "provider", header: "Provider", cell: (w) => <ProviderBadge provider={w.provider} /> },
    { key: "event", header: "Event", cell: (w) => <span className="block max-w-64 truncate" title={w.eventType ?? undefined}>{w.eventType ?? "—"}</span> },
    { key: "status", header: "Status", cell: (w) => (w.status ? <StatusBadge status={w.status} /> : <span className="text-(--c-muted)">—</span>) },
    { key: "ref", header: "Reference", cell: (w) => <span onClick={(e) => e.stopPropagation()}><CopyableId value={w.reference} label="reference" /></span> },
    {
      key: "matched",
      header: "Matched",
      cell: (w) => (w.matched ? <span className="text-(--c-muted)">Yes</span> : <StatusBadge status="UNMATCHED" tone="warn" label="Not matched" />),
    },
  ];

  const filtered = !!provider || tab !== "all";

  return (
    <div className="space-y-5">
      <PageHeader
        title="Webhooks"
        description="Events providers send us, and the ones that don't tie to any transaction."
        actions={
          <button
            type="button"
            onClick={() => list.refetch()}
            disabled={list.isFetching}
            className="inline-flex items-center gap-1.5 rounded-(--c-radius) border border-(--c-line) bg-(--c-field) px-3 py-1.5 font-medium transition-colors hover:bg-(--c-raised) disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--c-signal)"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${list.isFetching ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden />
            Refresh
          </button>
        }
      />

      <SegmentedTabs label="Webhook views" idPrefix="hooks" tabs={TABS} value={tab} onChange={reset(setTab)} />

      <FilterBar label="Filter webhook events">
        <SelectField label="Provider" value={provider} options={PROVIDERS} onChange={(e) => reset(setProvider)(e.target.value)} />
      </FilterBar>

      <DataTable
        caption="Webhook events"
        columns={columns}
        rows={list.data?.items}
        getRowId={(w) => w.id}
        isLoading={list.isLoading}
        error={list.error ? { message: errorMessage(list.error) } : null}
        errorTitle="Couldn't load webhook events"
        onRetry={() => list.refetch()}
        emptyTitle={filtered ? "No events match these filters" : "No webhook events yet"}
        emptyHint={tab === "unmatched" ? "Every event we received is tied to one of our transactions." : undefined}
        onRowClick={(w) => setSelected(w.id)}
        footer={<Pagination page={page} pageSize={pageSize} total={list.data?.total ?? 0} onPageChange={setPage} onPageSizeChange={reset(setPageSize)} disabled={list.isFetching} />}
      />

      <WebhookPanel id={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
