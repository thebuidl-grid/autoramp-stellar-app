"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Search, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { CopyableId, CursorPagination, DataTable, FilterBar, SelectField, StatusBadge, type Column } from "@/components/ui-shared";
import { adminApi, type TransferLog } from "@/lib/api";
import { useAuthStore } from "@/lib/store";

const STATUSES = [
  { value: "", label: "All statuses" },
  { value: "COMPLETED", label: "Completed" },
  { value: "PENDING", label: "Pending" },
  { value: "FAILED", label: "Failed" },
];

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : format(d, "MMM d, yyyy HH:mm");
};

/** SafeHaven and Stablestack transfer logs, now a tab of Transactions. Same data as the old Transfer Logs page. */
export function TransferLogsPanel() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const [stack, setStack] = useState<string[]>([]);
  const [pageSize, setPageSize] = useState(10);
  const [draft, setDraft] = useState("");
  const [filters, setFilters] = useState({ transactionId: "", status: "", startDate: "", endDate: "" });

  const cursor = stack[stack.length - 1];
  const query = useQuery({
    queryKey: ["admin-transfer-logs", cursor, pageSize, filters],
    queryFn: async () =>
      (await adminApi.getTransferLogs(pageSize, filters.transactionId || undefined, filters.status || undefined, filters.startDate || undefined, filters.endDate || undefined, cursor)).data,
    enabled: !!token,
  });

  const apply = (next: Partial<typeof filters>) => {
    setStack([]);
    setFilters((f) => ({ ...f, ...next }));
  };
  const search = (e: FormEvent) => {
    e.preventDefault();
    apply({ transactionId: draft.trim() });
  };

  const columns: Column<TransferLog>[] = [
    {
      key: "id",
      header: "Transaction",
      cell: (l) => (
        <span className="inline-flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <CopyableId value={l.transactionId} label="transaction id" />
          <Link href={`/admin/transfer-logs/${l.transactionId}`} className="text-(--c-signal-text) underline-offset-2 hover:underline">
            Details
          </Link>
        </span>
      ),
    },
    { key: "type", header: "Type", cell: (l) => (l.type === "ONRAMP" ? "On-ramp" : l.type === "OFFRAMP" ? "Off-ramp" : l.type) },
    { key: "status", header: "Status", cell: (l) => <StatusBadge status={l.status} /> },
    { key: "created", header: "Created", cell: (l) => when(l.createdAt), className: "whitespace-nowrap" },
    { key: "updated", header: "Updated", cell: (l) => <span className="text-(--c-muted)">{when(l.updatedAt)}</span>, className: "whitespace-nowrap" },
  ];

  return (
    <div className="space-y-3 pt-3">
      <FilterBar label="Filter transfer logs">
        <form onSubmit={search} role="search" className="relative w-full max-w-xs">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-(--c-muted)" />
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Find by transaction id"
            aria-label="Find by transaction id"
            autoComplete="off"
            spellCheck={false}
            className="h-8 w-full rounded-(--c-radius) border border-(--c-line) bg-(--c-field) pr-8 pl-8 font-mono text-[0.92em] placeholder:font-sans placeholder:text-(--c-muted) focus-visible:border-(--c-signal) focus-visible:outline-none"
          />
          {draft || filters.transactionId ? (
            <button
              type="button"
              aria-label="Clear transaction id"
              onClick={() => {
                setDraft("");
                apply({ transactionId: "" });
              }}
              className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-1 text-(--c-muted) hover:text-(--c-text) focus-visible:outline-2 focus-visible:outline-(--c-signal)"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          ) : null}
        </form>
        <SelectField label="Status" value={filters.status} options={STATUSES} onChange={(e) => apply({ status: e.target.value })} />
        <label className="inline-flex items-center gap-1.5 text-(--c-muted)">
          From
          <input type="date" value={filters.startDate} onChange={(e) => apply({ startDate: e.target.value })} className="h-8 rounded-(--c-radius) border border-(--c-line) bg-(--c-field) px-2 text-(--c-text) focus-visible:border-(--c-signal) focus-visible:outline-none" />
        </label>
        <label className="inline-flex items-center gap-1.5 text-(--c-muted)">
          To
          <input type="date" value={filters.endDate} onChange={(e) => apply({ endDate: e.target.value })} className="h-8 rounded-(--c-radius) border border-(--c-line) bg-(--c-field) px-2 text-(--c-text) focus-visible:border-(--c-signal) focus-visible:outline-none" />
        </label>
      </FilterBar>

      <DataTable
        caption="Transfer logs"
        columns={columns}
        rows={query.data?.logs}
        getRowId={(l) => l.id}
        isLoading={query.isLoading}
        error={query.error as { message?: string } | null}
        errorTitle="Couldn't load transfer logs"
        onRetry={() => query.refetch()}
        emptyTitle="No transfer logs found"
        emptyHint="Logs appear when SafeHaven or Stablestack are called for a transaction."
        onRowClick={(l) => router.push(`/admin/transfer-logs/${l.transactionId}`)}
        footer={
          <CursorPagination
            pageIndex={stack.length + 1}
            pageSize={pageSize}
            total={query.data?.total}
            hasNewer={stack.length > 0}
            hasOlder={!!query.data?.hasMore && !!query.data?.nextCursor}
            onNewer={() => setStack((s) => s.slice(0, -1))}
            onOlder={() => query.data?.nextCursor && setStack((s) => [...s, query.data!.nextCursor!])}
            onPageSizeChange={(size) => {
              setStack([]);
              setPageSize(size);
            }}
            disabled={query.isFetching}
          />
        }
      />
    </div>
  );
}
