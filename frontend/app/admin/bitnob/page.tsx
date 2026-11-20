"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { RefreshCw, Search, X } from "lucide-react";
import { CopyableId, CursorPagination, DataTable, FilterBar, FreshnessLabel, Money, PageHeader, SelectField, StatusBadge, type Column } from "@/components/ui-shared";
import { BitnobTransactionPanel } from "@/components/admin/bitnob/TransactionPanel";
import { bitnobErrorHint, bitnobTypeLabel, parseBitnobAmount } from "@/lib/bitnob-format";
import { useBitnobBalances, useBitnobTransactions, type BitnobError, type BitnobTransaction, type BitnobTransactionFilters } from "@/lib/hooks/use-admin-bitnob";

const DIRECTIONS = [
  { value: "", label: "All activity" },
  { value: "inflow", label: "Money in" },
  { value: "outflow", label: "Money out" },
];

function when(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : format(d, "MMM d, HH:mm");
}

/** What we hold at Bitnob: one panel, one line per currency. */
function Balances() {
  const { data, error, isLoading, dataUpdatedAt } = useBitnobBalances();
  const accounts = (data?.accounts ?? []).filter((a) => a.currency);

  return (
    <section aria-label="Balances at Bitnob" className="overflow-hidden rounded-(--c-radius) border border-(--c-line) bg-(--c-panel)">
      <div className="flex items-center justify-between border-b border-(--c-line) px-(--c-pad) py-2">
        <h2 className="font-medium">Balances</h2>
        <FreshnessLabel updatedAt={dataUpdatedAt} className="text-xs text-(--c-muted)" />
      </div>
      {error ? (
        <p role="alert" className="px-(--c-pad) py-3 text-(--c-danger)">
          {error.message}. <span className="text-(--c-muted)">{bitnobErrorHint(error.message, error.status)}</span>
        </p>
      ) : isLoading ? (
        <div role="status" aria-label="Loading balances" className="h-14 animate-pulse bg-(--c-field)/40 motion-reduce:animate-none" />
      ) : accounts.length === 0 ? (
        <p className="px-(--c-pad) py-3 text-(--c-muted)">Bitnob returned no balances.</p>
      ) : (
        <dl className="flex flex-wrap divide-x divide-(--c-line)">
          {accounts.map((a) => (
            <div key={a.account_id ?? a.currency} className="min-w-32 flex-1 px-(--c-pad) py-3">
              <dt className="text-(--c-muted)">{a.currency}</dt>
              <dd className="mt-0.5 text-lg font-semibold">
                <Money value={a.available_balance_formatted} currency={a.currency} maxFraction={a.currency === "BTC" ? 8 : 6} minFraction={2} />
              </dd>
              {a.ledger_balance_formatted && a.ledger_balance_formatted !== a.available_balance_formatted ? (
                <p className="text-xs text-(--c-muted)">Ledger {a.ledger_balance_formatted}</p>
              ) : null}
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

/** Opens filtered to one reference when the link has ?reference= (the trace page links here). Remounts when it changes. */
export default function AdminBitnobPage() {
  return (
    <Suspense fallback={null}>
      <BitnobFromUrl />
    </Suspense>
  );
}

function BitnobFromUrl() {
  const reference = useSearchParams()?.get("reference")?.trim() ?? "";
  return <BitnobContent key={reference} initialReference={reference} />;
}

function BitnobContent({ initialReference }: { initialReference: string }) {
  const [stack, setStack] = useState<string[]>([]); // cursors of the pages we came from
  const [draft, setDraft] = useState(initialReference);
  const [filters, setFilters] = useState<BitnobTransactionFilters>(initialReference ? { reference: initialReference } : {});
  const [selected, setSelected] = useState<BitnobTransaction | null>(null);
  const [pageSize, setPageSize] = useState(25);

  const cursor = stack[stack.length - 1];
  const list = useBitnobTransactions(cursor, filters, pageSize);
  const balances = useBitnobBalances();
  const rows = list.data?.transactions;

  const applyFilters = (next: BitnobTransactionFilters) => {
    setStack([]);
    setFilters(next);
  };
  const search = (e: FormEvent) => {
    e.preventDefault();
    const reference = draft.trim();
    applyFilters({ ...filters, reference: reference || undefined });
  };
  const clearSearch = () => {
    setDraft("");
    applyFilters({ ...filters, reference: undefined });
  };

  const columns: Column<BitnobTransaction>[] = [
    { key: "when", header: "When", cell: (t) => <span title={t.created_at}>{when(t.created_at)}</span>, className: "whitespace-nowrap" },
    { key: "type", header: "Type", cell: (t) => bitnobTypeLabel(t.type) },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      cell: (t) => {
        const a = parseBitnobAmount(t);
        return a.value === null ? "—" : <Money value={a.value} currency={a.currency} direction={a.direction ?? undefined} maxFraction={6} minFraction={2} />;
      },
    },
    {
      key: "fee",
      header: "Fee",
      align: "right",
      cell: (t) => {
        const f = parseBitnobAmount({ amount_formatted: t.fee_formatted, currency: t.currency });
        return f.value === null ? "—" : <Money value={f.value} currency={f.currency} maxFraction={6} minFraction={2} className="text-(--c-muted)" />;
      },
    },
    { key: "status", header: "Status", cell: (t) => <StatusBadge status={t.state} /> },
    { key: "ref", header: "Reference", cell: (t) => <span onClick={(e) => e.stopPropagation()}><CopyableId value={t.reference} label="reference" /></span> },
  ];

  const hasFilter = !!filters.reference || !!filters.direction;
  const error = list.error as BitnobError | null;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Bitnob"
        description="Our Bitnob account: what we hold, and every record on it. Read only."
        actions={
          <button
            type="button"
            onClick={() => {
              list.refetch();
              balances.refetch();
            }}
            disabled={list.isFetching || balances.isFetching}
            className="inline-flex items-center gap-1.5 rounded-(--c-radius) border border-(--c-line) bg-(--c-field) px-3 py-1.5 font-medium transition-colors hover:bg-(--c-raised) disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--c-signal)"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${list.isFetching ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden />
            Refresh
          </button>
        }
      />

      <Balances />

      <FilterBar label="Filter Bitnob transactions">
        <form onSubmit={search} role="search" className="relative w-full max-w-sm">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-(--c-muted)" />
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Find by reference, e.g. off_…"
            aria-label="Find by reference"
            autoComplete="off"
            spellCheck={false}
            className="h-8 w-full rounded-(--c-radius) border border-(--c-line) bg-(--c-field) pr-8 pl-8 font-mono text-[0.92em] placeholder:font-sans placeholder:text-(--c-muted) focus-visible:border-(--c-signal) focus-visible:outline-none"
          />
          {draft || filters.reference ? (
            <button type="button" onClick={clearSearch} aria-label="Clear search" className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-1 text-(--c-muted) hover:text-(--c-text) focus-visible:outline-2 focus-visible:outline-(--c-signal)">
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          ) : null}
        </form>
        <SelectField label="Direction" value={filters.direction ?? ""} options={DIRECTIONS} onChange={(e) => applyFilters({ ...filters, direction: (e.target.value || undefined) as BitnobTransactionFilters["direction"] })} />
      </FilterBar>

      <DataTable
        caption="Bitnob transactions"
        columns={columns}
        rows={rows}
        getRowId={(t) => t.transaction_id ?? `${t.reference}-${t.created_at}`}
        isLoading={list.isLoading}
        error={error}
        errorTitle="Couldn't load Bitnob transactions"
        onRetry={() => list.refetch()}
        emptyTitle={filters.reference ? `No Bitnob record with reference ${filters.reference}` : hasFilter ? "No transactions match these filters" : "No transactions yet"}
        emptyHint={filters.reference ? "References must match exactly. Our off-ramp references start with off_." : undefined}
        onRowClick={setSelected}
        footer={
          <CursorPagination
            pageIndex={stack.length + 1}
            pageSize={pageSize}
            total={list.data?.total_count}
            hasNewer={stack.length > 0}
            hasOlder={!!list.data?.next_cursor}
            onNewer={() => setStack((s) => s.slice(0, -1))}
            onOlder={() => list.data?.next_cursor && setStack((s) => [...s, list.data!.next_cursor!])}
            onPageSizeChange={(size) => {
              setStack([]);
              setPageSize(size);
            }}
            disabled={list.isFetching}
          />
        }
      />

      <BitnobTransactionPanel tx={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
