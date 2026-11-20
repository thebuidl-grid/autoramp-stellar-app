"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CopyableId, DataTable, FilterBar, Money, Pagination, SelectField, StatusBadge, type Column } from "@/components/ui-shared";
import { amountCurrency, transactionTypeLabel } from "@/components/admin/transactions/labels";
import { errorMessage, useFailedTransactions, useStuckTransactions } from "@/lib/hooks/use-admin-tracker";
import { formatAge, traceUrl, type HealthRow } from "@/lib/tracker";
import { ProviderChips } from "./TraceRibbon";

const TYPES = [
  { value: "", label: "All types" },
  { value: "onramp", label: "On-ramp" },
  { value: "offramp", label: "Off-ramp" },
  { value: "swap", label: "Swap" },
  { value: "otc", label: "OTC" },
  { value: "bridge", label: "Bridge" },
  { value: "merchant_onramp", label: "Merchant on-ramp" },
  { value: "merchant_offramp", label: "Merchant off-ramp" },
  { value: "merchant_swap", label: "Merchant swap" },
  { value: "vas", label: "VAS" },
];

const PROVIDERS = [
  { value: "", label: "All providers" },
  { value: "BITNOB", label: "Bitnob" },
  { value: "SAFEHAVEN", label: "Safehaven" },
  { value: "PULSE_MFB", label: "Pulse MFB" },
  { value: "BLOCKRADAR", label: "Blockradar" },
  { value: "FLINT", label: "Flint" },
  { value: "CCTP", label: "CCTP" },
];

/** What went wrong or where it stopped, in one line: a failed provider step first, else the last thing recorded. */
export function stoppedAt(row: Pick<HealthRow, "providers" | "lastStep">): string | null {
  const failed = row.providers.find((p) => p.failedStep);
  if (failed) return `${failed.failedStep!.replace(/_/g, " ")} (${failed.provider})`;
  return row.lastStep ? row.lastStep.replace(/_/g, " ") : null;
}

/** The Stuck and Failed lists. A row opens its trace. */
export function HealthPanel({ kind }: { kind: "stuck" | "failed" }) {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [type, setType] = useState("");
  const [provider, setProvider] = useState("");
  const [includeAbandoned, setIncludeAbandoned] = useState(false);

  const params = { type: type || undefined, provider: provider || undefined, limit: pageSize, offset: (page - 1) * pageSize };
  const stuck = useStuckTransactions({ ...params, includeAbandoned }, kind === "stuck");
  const failed = useFailedTransactions(params, kind === "failed");
  const query = kind === "stuck" ? stuck : failed;
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  const columns: Column<HealthRow>[] = [
    { key: "ref", header: "Reference", cell: (r) => <span onClick={(e) => e.stopPropagation()}><CopyableId value={r.reference} label="reference" /></span> },
    { key: "type", header: "Type", cell: (r) => transactionTypeLabel(r.type) },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      cell: (r) => {
        const currency = r.currency ?? amountCurrency({ type: r.type });
        return r.amount === null ? "—" : <Money value={r.amount} currency={currency} maxFraction={currency === "NGN" ? 2 : 6} minFraction={2} />;
      },
    },
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
    { key: "stopped", header: kind === "stuck" ? "Stopped at" : "Failed at", cell: (r) => stoppedAt(r) ?? <span className="text-(--c-muted)">Not recorded</span> },
    { key: "who", header: "Handled by", cell: (r) => <ProviderChips providers={r.providers} /> },
    { key: "age", header: kind === "stuck" ? "Stuck for" : "Since", align: "right", cell: (r) => <span className="tabular-nums text-(--c-muted)" title={r.updatedAt}>{formatAge(r.ageMinutes)}</span> },
  ];

  const filtered = !!type || !!provider;

  return (
    <div className="space-y-3 pt-3">
      <FilterBar label={`Filter ${kind} transactions`}>
        <SelectField label="Type" value={type} options={TYPES} onChange={(e) => reset(setType)(e.target.value)} />
        <SelectField label="Provider" value={provider} options={PROVIDERS} onChange={(e) => reset(setProvider)(e.target.value)} />
        {kind === "stuck" ? (
          <label className="inline-flex items-center gap-2 text-(--c-muted)">
            <input type="checkbox" checked={includeAbandoned} onChange={(e) => reset(setIncludeAbandoned)(e.target.checked)} className="h-4 w-4 accent-(--c-signal)" />
            Include abandoned (untouched for weeks)
          </label>
        ) : null}
      </FilterBar>

      <DataTable
        caption={kind === "stuck" ? "Stuck transactions" : "Failed transactions"}
        columns={columns}
        rows={query.data?.items}
        getRowId={(r) => `${r.type}-${r.id}`}
        isLoading={query.isLoading}
        error={query.error ? { message: errorMessage(query.error) } : null}
        errorTitle={`Couldn't load ${kind} transactions`}
        onRetry={() => query.refetch()}
        emptyTitle={filtered ? `No ${kind} transactions match these filters` : kind === "stuck" ? "Nothing is stuck" : "Nothing has failed"}
        emptyHint={kind === "stuck" && !filtered ? "A transaction shows here when it has been in one step for longer than that step should take." : undefined}
        onRowClick={(r) => router.push(traceUrl(r.reference))}
        footer={<Pagination page={page} pageSize={pageSize} total={query.data?.total ?? 0} onPageChange={setPage} onPageSizeChange={reset(setPageSize)} disabled={query.isFetching} />}
      />
    </div>
  );
}
