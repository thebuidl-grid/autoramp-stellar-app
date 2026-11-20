"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ExternalLink, Search, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { DataTable, FilterBar, PageHeader, Pagination, SegmentedTabs, StatusBadge, type Column } from "@/components/ui-shared";
import { countByKyb, filterMerchants, kybLabel, websiteHref, type KybFilter } from "@/components/admin/merchants/kyb";
import { adminApi, type MerchantUser } from "@/lib/api";
import { useAuthStore } from "@/lib/store";

export default function AdminMerchantsPage() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const [status, setStatus] = useState<KybFilter>("all");
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const query = useQuery({
    queryKey: ["admin-merchants"],
    queryFn: async () => (await adminApi.getMerchants()).data,
    enabled: !!token,
  });

  const all = query.data ?? [];
  const counts = countByKyb(all);
  const filtered = filterMerchants(all, status, term);
  const rows = query.data ? filtered.slice((page - 1) * pageSize, page * pageSize) : undefined;

  const tabs = [
    { value: "all", label: "All", count: query.data ? counts.all : null },
    { value: "PENDING", label: "Pending review", count: query.data ? counts.PENDING : null },
    { value: "VERIFIED", label: "Approved", count: query.data ? counts.VERIFIED : null },
    { value: "REJECTED", label: "Rejected", count: query.data ? counts.REJECTED : null },
  ];

  const columns: Column<MerchantUser>[] = [
    {
      key: "merchant",
      header: "Merchant",
      cell: (m) => (
        <span className="block min-w-0">
          <span className="block truncate font-medium">{m.name || "Unknown business"}</span>
          <span className="block truncate text-xs text-(--c-muted)">{m.user?.email}</span>
        </span>
      ),
    },
    {
      key: "business",
      header: "Business",
      cell: (m) => (
        <span className="block min-w-0 text-xs">
          {m.websiteUrl ? (
            <a href={websiteHref(m.websiteUrl)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-(--c-signal-text) underline-offset-2 hover:underline">
              {m.websiteUrl.replace(/^https?:\/\//i, "")}
              <ExternalLink className="h-3 w-3" aria-hidden />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          ) : null}
          <span className="block text-(--c-muted)">{m.natureOfBusiness || "No business type given"}</span>
          {m.metadata?.contactPerson ? <span className="block text-(--c-muted)">Contact: {m.metadata.contactPerson}</span> : null}
        </span>
      ),
    },
    {
      key: "kyb",
      header: "KYB",
      cell: (m) => (
        <span className="block">
          <StatusBadge status={m.status} tone={m.status === "PENDING" ? "warn" : undefined} label={kybLabel(m.status)} />
          {m.status === "REJECTED" && m.rejectionReason ? (
            <span className="mt-1 block max-w-56 truncate text-xs text-(--c-muted)" title={m.rejectionReason}>
              {m.rejectionReason}
            </span>
          ) : null}
          {m.isApiAccessApproved ? <span className="mt-1 block text-xs text-(--c-muted)">API access on</span> : null}
        </span>
      ),
    },
    { key: "joined", header: "Joined", cell: (m) => <span className="text-(--c-muted)">{format(new Date(m.createdAt), "MMM d, yyyy")}</span>, className: "whitespace-nowrap" },
    {
      key: "open",
      header: <span className="sr-only">Open</span>,
      align: "right",
      cell: (m) => (
        <Link href={`/admin/merchants/${m.id}`} onClick={(e) => e.stopPropagation()} aria-label={`Open ${m.name || "merchant"}`} className="text-(--c-signal-text) underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-(--c-signal)">
          Open
        </Link>
      ),
    },
  ];

  const isFiltered = status !== "all" || !!term.trim();

  return (
    <div className="space-y-5">
      <PageHeader title="Merchants" description="Review business applications and see who has API access." />

      <SegmentedTabs
        label="KYB status"
        idPrefix="merchants"
        tabs={tabs}
        value={status}
        onChange={(v) => {
          setStatus(v as KybFilter);
          setPage(1);
        }}
      />

      <FilterBar label="Filter merchants">
        <div className="relative w-full max-w-sm">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-(--c-muted)" />
          <input
            type="text"
            value={term}
            onChange={(e) => {
              setTerm(e.target.value);
              setPage(1);
            }}
            placeholder="Find by business name or email"
            aria-label="Find by business name or email"
            autoComplete="off"
            className="h-8 w-full rounded-(--c-radius) border border-(--c-line) bg-(--c-field) pr-8 pl-8 placeholder:text-(--c-muted) focus-visible:border-(--c-signal) focus-visible:outline-none"
          />
          {term ? (
            <button type="button" aria-label="Clear search" onClick={() => { setTerm(""); setPage(1); }} className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-1 text-(--c-muted) hover:text-(--c-text) focus-visible:outline-2 focus-visible:outline-(--c-signal)">
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          ) : null}
        </div>
      </FilterBar>

      <DataTable
        caption="Merchants"
        columns={columns}
        rows={rows}
        getRowId={(m) => m.id}
        isLoading={query.isLoading}
        error={query.error as { message?: string } | null}
        errorTitle="Couldn't load merchants"
        onRetry={() => query.refetch()}
        emptyTitle={isFiltered ? "No merchants match these filters" : "No merchants yet"}
        emptyHint={isFiltered ? "Try a different status or search." : "Merchants appear here once they start onboarding."}
        onRowClick={(m) => router.push(`/admin/merchants/${m.id}`)}
        footer={<Pagination page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} />}
      />
    </div>
  );
}
