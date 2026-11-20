"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { Search } from "lucide-react";
import { CopyableId, DataTable, DetailList, FilterBar, PageHeader, Pagination, SelectField, SidePanel, StatusBadge, StatusTrack, type Column } from "@/components/ui-shared";
import { explorerTxUrl } from "@/lib/explorers";
import { errorMessage } from "@/lib/hooks/use-admin-tracker";
import { useCctpTransfers } from "@/lib/hooks/use-admin-safehaven";
import { useDebounce } from "@/lib/hooks";
import { bridgeAmount, chainLabel, isTestChain, type CctpTransfer } from "@/lib/safehaven";
import { formatAmount } from "@/components/ui-shared";
import { traceUrl } from "@/lib/tracker";

const STATUSES = [
  { value: "", label: "All statuses" },
  { value: "PENDING", label: "Pending" },
  { value: "PROCESSING", label: "In transit" },
  { value: "COMPLETED", label: "Delivered" },
  { value: "FAILED", label: "Failed" },
];

const when = (iso: string) => format(new Date(iso), "MMM d, HH:mm");
const usdc = (raw: string) => {
  const v = bridgeAmount(raw);
  return v === null ? "—" : `${formatAmount(v, { maxFraction: 6, minFraction: 2 })} USDC`;
};
const owner = (t: CctpTransfer) => t.merchantName ?? t.userEmail ?? "—";

/** The chain a transfer ran on, with a marker when it is a test network (the chain name carries it). */
function Route({ t }: { t: CctpTransfer }) {
  const test = isTestChain(t.fromChain) || isTestChain(t.toChain);
  return (
    <span className="whitespace-nowrap">
      {chainLabel(t.fromChain)} → {chainLabel(t.toChain)}
      {t.kind === "offramp_relay" ? <span className="ml-2 text-xs text-(--c-muted)">Off-ramp</span> : null}
      {test ? <span className="ml-2 rounded-full border border-(--c-warn) px-1.5 py-0.5 text-xs text-(--c-warn)">Test</span> : null}
    </span>
  );
}

function HashLink({ chain, hash, label }: { chain: string; hash: string | null; label: string }) {
  if (!hash) return <span className="text-(--c-muted)">—</span>;
  const url = explorerTxUrl(chain, hash);
  return <CopyableId value={hash} label={label} href={url ?? undefined} />;
}

function TransferPanel({ t, onClose }: { t: CctpTransfer | null; onClose: () => void }) {
  return (
    <SidePanel open={!!t} onOpenChange={(o) => !o && onClose()} title={t ? `${chainLabel(t.fromChain)} to ${chainLabel(t.toChain)}` : "Transfer"} description={t ? format(new Date(t.createdAt), "MMM d, yyyy HH:mm:ss") : undefined}>
      {t ? (
        <div className="space-y-5">
          <div className="flex items-end justify-between gap-3">
            <p className="text-3xl font-semibold tabular-nums">{usdc(t.amount)}</p>
            <StatusBadge status={t.status} />
          </div>
          <StatusTrack kind="BRIDGE" status={t.status} />
          {t.failureReason || t.failedStep ? (
            <div role="alert" className="rounded-(--c-radius) border border-(--c-danger) px-3 py-2">
              <p className="font-medium text-(--c-danger)">Failed{t.failedStep ? ` at ${t.failedStep.replace(/_/g, " ")}` : ""}</p>
              {t.failureReason ? <p className="text-(--c-muted)">{t.failureReason}</p> : null}
            </div>
          ) : null}
          <DetailList
            items={[
              { label: "Kind", value: t.kind === "offramp_relay" ? "Off-ramp funded over CCTP" : "Bridge transfer" },
              { label: "Reference", value: <CopyableId value={t.reference} label="reference" /> },
              { label: "Belongs to", value: owner(t) },
              { label: "Burn transaction", value: <HashLink chain={t.fromChain} hash={t.burnTxHash} label="burn transaction hash" /> },
              ...(t.sourceAddress ? [{ label: "From address", value: <CopyableId value={t.sourceAddress} label="source address" /> }] : []),
              ...(t.destinationAddress ? [{ label: "To address", value: <CopyableId value={t.destinationAddress} label="destination address" /> }] : []),
              ...(t.legReference ? [{ label: "CCTP reference", value: <CopyableId value={t.legReference} label="CCTP reference" /> }] : []),
              ...(t.legStatus ? [{ label: "CCTP status", value: t.legStatus }] : []),
              ...(t.lastEventAt ? [{ label: "Last update", value: when(t.lastEventAt) }] : []),
              ...(t.chainNetwork ? [{ label: "Network", value: t.chainNetwork === "testnet" ? "Testnet" : "Mainnet" }] : []),
              ...(t.offrampReference ? [{ label: "Off-ramp", value: <Link className="underline underline-offset-2" href={traceUrl(t.offrampReference)}>{t.offrampReference}</Link> }] : []),
            ]}
          />
          <Link href={traceUrl(t.reference)} className="inline-block rounded-(--c-radius) bg-(--c-signal) px-3 py-1.5 font-medium text-(--c-signal-ink) hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--c-signal)">
            Trace this transfer
          </Link>
        </div>
      ) : null}
    </SidePanel>
  );
}

/** Every cross-chain USDC transfer over CCTP: where it is in burn, attestation and mint, and who it belongs to. */
export default function AdminCctpPage() {
  return (
    <Suspense fallback={null}>
      <CctpFromUrl />
    </Suspense>
  );
}

function CctpFromUrl() {
  const q = useSearchParams()?.get("q")?.trim() ?? "";
  return <CctpContent key={q} initialSearch={q} />;
}

function CctpContent({ initialSearch }: { initialSearch: string }) {
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState(initialSearch);
  const q = useDebounce(search.trim(), 300) || undefined;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState<CctpTransfer | null>(null);
  const list = useCctpTransfers({ status: status || undefined, q, limit: pageSize, offset: (page - 1) * pageSize });
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  const columns: Column<CctpTransfer>[] = [
    { key: "when", header: "When", cell: (t) => <span className="text-(--c-muted)">{when(t.createdAt)}</span>, className: "whitespace-nowrap" },
    { key: "route", header: "Route", cell: (t) => <Route t={t} /> },
    { key: "amount", header: "Amount", cell: (t) => usdc(t.amount), className: "text-right tabular-nums whitespace-nowrap" },
    { key: "progress", header: "Progress", cell: (t) => <StatusTrack kind="BRIDGE" status={t.status} compact /> },
    { key: "status", header: "Status", cell: (t) => <StatusBadge status={t.status} /> },
    { key: "owner", header: "Belongs to", cell: (t) => <span className="block max-w-44 truncate">{owner(t)}</span> },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="CCTP" description="Cross-chain USDC transfers: where each one is, the burn and mint, and who it belongs to." />
      <FilterBar label="Filter CCTP transfers">
        <label className="relative">
          <span className="sr-only">Search</span>
          <Search className="pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-(--c-muted)" aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(e) => reset(setSearch)(e.target.value)}
            placeholder="Reference, hash, address or email"
            className="h-8 w-72 rounded-(--c-radius) border border-(--c-line) bg-(--c-field) pr-2 pl-7 focus-visible:outline-2 focus-visible:outline-(--c-signal)"
          />
        </label>
        <SelectField label="Status" value={status} options={STATUSES} onChange={(e) => reset(setStatus)(e.target.value)} />
      </FilterBar>
      <DataTable
        caption="CCTP transfers"
        columns={columns}
        rows={list.data?.items}
        getRowId={(t) => t.id}
        isLoading={list.isLoading}
        error={list.error ? { message: errorMessage(list.error) } : null}
        errorTitle="Couldn't load CCTP transfers"
        onRetry={() => list.refetch()}
        emptyTitle={status || q ? "No transfers match these filters" : "No CCTP transfers yet"}
        onRowClick={(t) => setSelected(t)}
        footer={<Pagination page={page} pageSize={pageSize} total={list.data?.total ?? 0} onPageChange={setPage} onPageSizeChange={reset(setPageSize)} disabled={list.isFetching} />}
      />
      <TransferPanel t={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
