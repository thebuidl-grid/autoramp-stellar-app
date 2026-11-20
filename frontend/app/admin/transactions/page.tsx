"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { Search, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { CopyableId, DataTable, FilterBar, Money, PageHeader, Pagination, SegmentedTabs, SelectField, StatusBadge, StatusTrack, TabPanel, type Column } from "@/components/ui-shared";
import { SummaryStrip } from "@/components/admin/transactions/SummaryStrip";
import { TransactionPanel } from "@/components/admin/transactions/TransactionPanel";
import { TransactionsOverview } from "@/components/admin/transactions/TransactionsOverview";
import { TransferLogsPanel } from "@/components/admin/transactions/TransferLogsPanel";
import { HealthPanel } from "@/components/admin/tracker/HealthPanel";
import { FAILED_TAB, FILTER_STATUSES, STUCK_TAB, TRANSFER_LOGS_TAB, amountCurrency, isKnownTab, trackKindFor, transactionTypeLabel } from "@/components/admin/transactions/labels";
import { adminApi, type PlatformTransaction } from "@/lib/api";
import { useAdminSummary } from "@/lib/hooks/use-admin-overview";
import { useAuthStore } from "@/lib/store";

type SummaryPeriod = "today" | "7d" | "30d" | "90d" | "all";

const PERIODS: Array<{ value: SummaryPeriod; label: string }> = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

const STATUS_OPTIONS = [{ value: "all", label: "All statuses" }, ...FILTER_STATUSES.map((s) => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase() }))];
const CURRENCY_OPTIONS = ["NGN", "KES", "GHS", "USD", "USDC", "USDT", "CNGN"].map((c) => ({ value: c, label: c }));

const TABS = [
  { value: "all", label: "All" },
  { value: "onramp", label: "Onramp" },
  { value: "offramp", label: "Offramp" },
  { value: "swap", label: "Swap" },
  { value: "otc", label: "OTC" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "vas", label: "VAS" },
  { value: "merchant", label: "Merchant" },
  { value: STUCK_TAB, label: "Stuck" },
  { value: FAILED_TAB, label: "Failed" },
  { value: TRANSFER_LOGS_TAB, label: "Transfer logs" },
];

/**
 * `?q=<reference>` (top-bar Trace search, Bitnob panel), `?status=FAILED` (Needs attention) and `?tab=` open this page already
 * filtered. The content remounts when they change, so following a link while already here still works.
 */
export default function AdminTransactionsPage() {
  return (
    <Suspense fallback={null}>
      <TransactionsFromUrl />
    </Suspense>
  );
}

function TransactionsFromUrl() {
  const params = useSearchParams();
  const q = params?.get("q")?.trim() ?? "";
  const status = (params?.get("status") ?? "").toUpperCase();
  const tabParam = params?.get("tab") ?? "";
  const initialStatus = FILTER_STATUSES.includes(status) ? status : "all";
  const initialTab = isKnownTab(tabParam) ? tabParam : "all";
  return <TransactionsContent key={`${q}|${initialStatus}|${initialTab}`} initialSearch={q} initialStatus={initialStatus} initialTab={initialTab} />;
}

function TransactionsContent({ initialSearch, initialStatus, initialTab }: { initialSearch: string; initialStatus: string; initialTab: string }) {
  const token = useAuthStore((s) => s.token);
  const [tab, setTab] = useState(initialTab);
  const [period, setPeriod] = useState<SummaryPeriod>("30d");
  const [draft, setDraft] = useState(initialSearch);
  const [search, setSearch] = useState(initialSearch);
  const [status, setStatus] = useState(initialStatus);
  const [currency, setCurrency] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState<PlatformTransaction | null>(null);

  const summary = useAdminSummary(period);
  const showingLogs = tab === TRANSFER_LOGS_TAB;
  const showingHealth = tab === STUCK_TAB || tab === FAILED_TAB;
  const showingList = !showingLogs && !showingHealth;

  const list = useQuery({
    queryKey: ["admin-transactions", page, pageSize, status, tab, search, currency],
    queryFn: async () => (await adminApi.getTransactions(page, pageSize, status === "all" ? undefined : status, tab === "all" ? undefined : tab, search || undefined, currency === "all" ? undefined : currency)).data,
    enabled: !!token && showingList,
  });

  const reset = () => setPage(1);
  const submitSearch = (e: FormEvent) => {
    e.preventDefault();
    setSearch(draft.trim());
    reset();
  };

  const columns: Column<PlatformTransaction>[] = [
    { key: "ref", header: "Reference", cell: (t) => <span onClick={(e) => e.stopPropagation()}><CopyableId value={t.reference} label="reference" /></span> },
    { key: "who", header: "Who", cell: (t) => <span className="block max-w-56 truncate" title={t.user ?? t.merchant ?? undefined}>{t.user ?? t.merchant ?? "System"}</span> },
    { key: "type", header: "Type", cell: (t) => transactionTypeLabel(t.type) },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      cell: (t) => {
        const amountCurrencyCode = amountCurrency(t);
        return <Money value={String(t.amount)} currency={amountCurrencyCode} maxFraction={amountCurrencyCode === "NGN" ? 2 : 6} minFraction={2} />;
      },
    },
    { key: "currency", header: "Currency", cell: (t) => t.currency?.toUpperCase() ?? "—" },
    {
      key: "status",
      header: "Status",
      cell: (t) => {
        const kind = trackKindFor(t.type);
        return (
          <span className="inline-flex items-center gap-3">
            <StatusBadge status={t.status} />
            {kind ? <StatusTrack kind={kind} status={t.status} compact /> : null}
          </span>
        );
      },
    },
    {
      key: "date",
      header: "Date",
      cell: (t) => {
        const d = new Date(t.createdAt);
        return <span className="text-(--c-muted)" title={t.createdAt}>{Number.isNaN(d.getTime()) ? t.createdAt : format(d, "MMM d, HH:mm")}</span>;
      },
      className: "whitespace-nowrap",
    },
  ];

  const periodLabel = PERIODS.find((p) => p.value === period)?.label.toLowerCase() ?? period;
  const hasFilter = !!search || status !== "all" || currency !== "all" || tab !== "all";

  return (
    <div className="space-y-5">
      <PageHeader
        title="Transactions"
        description="Every payment on the platform, with the summary for the period you pick."
        actions={<SelectField label="Summary period" value={period} options={PERIODS} onChange={(e) => setPeriod(e.target.value as SummaryPeriod)} />}
      />

      <SummaryStrip summary={summary.data} isLoading={summary.isLoading} isError={summary.isError} periodLabel={periodLabel} />

      <div>
        <SegmentedTabs
          label="Transaction type"
          idPrefix="tx"
          tabs={TABS}
          value={tab}
          onChange={(v) => {
            setTab(v);
            reset();
          }}
        />

        <TabPanel value={TRANSFER_LOGS_TAB} current={tab} idPrefix="tx">
          <TransferLogsPanel />
        </TabPanel>
        <TabPanel value={STUCK_TAB} current={tab} idPrefix="tx">
          <HealthPanel kind="stuck" />
        </TabPanel>
        <TabPanel value={FAILED_TAB} current={tab} idPrefix="tx">
          <HealthPanel kind="failed" />
        </TabPanel>

        {showingList ? (
          <div role="tabpanel" id={`tx-panel-${tab}`} aria-labelledby={`tx-tab-${tab}`} className="space-y-3 pt-3">
            <FilterBar label="Filter transactions">
              <form onSubmit={submitSearch} role="search" className="relative w-full max-w-sm">
                <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-(--c-muted)" />
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Find by reference or user"
                  aria-label="Find by reference or user"
                  autoComplete="off"
                  spellCheck={false}
                  className="h-8 w-full rounded-(--c-radius) border border-(--c-line) bg-(--c-field) pr-8 pl-8 placeholder:text-(--c-muted) focus-visible:border-(--c-signal) focus-visible:outline-none"
                />
                {draft || search ? (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => {
                      setDraft("");
                      setSearch("");
                      reset();
                    }}
                    className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-1 text-(--c-muted) hover:text-(--c-text) focus-visible:outline-2 focus-visible:outline-(--c-signal)"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                ) : null}
              </form>
              <SelectField
                label="Status"
                value={status}
                options={STATUS_OPTIONS}
                onChange={(e) => {
                  setStatus(e.target.value);
                  reset();
                }}
              />
              <SelectField
                label="Currency"
                value={currency}
                options={[{ value: "all", label: "All currencies" }, ...CURRENCY_OPTIONS]}
                onChange={(e) => { setCurrency(e.target.value); reset(); }}
              />
            </FilterBar>

            <DataTable
              caption="Transactions"
              columns={columns}
              rows={list.data?.data}
              getRowId={(t) => `${t.type}-${t.id}`}
              isLoading={list.isLoading}
              error={list.error as { message?: string } | null}
              errorTitle="Couldn't load transactions"
              onRetry={() => list.refetch()}
              emptyTitle={hasFilter ? "No transactions match these filters" : "No transactions yet"}
              emptyHint={hasFilter ? "Try a different status, type or reference." : undefined}
              onRowClick={setSelected}
              footer={
                <Pagination
                  page={page}
                  pageSize={pageSize}
                  total={list.data?.pagination?.total ?? 0}
                  onPageChange={setPage}
                  onPageSizeChange={(size) => {
                    setPageSize(size);
                    reset();
                  }}
                  disabled={list.isFetching}
                />
              }
            />
          </div>
        ) : null}
      </div>

      <section aria-label="Volume over time" className="space-y-2">
        <h2 className="font-medium">Volume over time</h2>
        <TransactionsOverview />
      </section>

      <TransactionPanel tx={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
