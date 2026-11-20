"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { RefreshCw, Search, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  CopyableId,
  CursorPagination,
  DataTable,
  FilterBar,
  Money,
  PageHeader,
  Pagination,
  SegmentedTabs,
  SelectField,
  StatusBadge,
  TabPanel,
  type Column,
} from "@/components/ui-shared";
import { adminApi, type AdminOtcTransaction, type AdminUser } from "@/lib/api";
import { useAdminOtcTransactions, useAdminOtcUsers } from "@/lib/hooks/use-admin-otc";
import { useCursorPagination } from "@/lib/hooks/use-cursor-pagination";

const STATUSES = [
  { value: "all", label: "All statuses" },
  { value: "COMPLETED", label: "Completed" },
  { value: "PENDING", label: "Pending" },
  { value: "PROCESSING", label: "Processing" },
  { value: "FAILED", label: "Failed" },
];

const TABS = [
  { value: "transactions", label: "Transactions" },
  { value: "users", label: "OTC users" },
];

const dateInput = "h-8 rounded-(--c-radius) border border-(--c-line) bg-(--c-field) px-2 text-(--c-text) focus-visible:border-(--c-signal) focus-visible:outline-none";

export default function AdminOtcPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("transactions");

  // transactions (cursor paged)
  const cursor = useCursorPagination();
  const [pageSize, setPageSize] = useState(10);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const tx = useAdminOtcTransactions(pageSize, status === "all" ? undefined : status, startDate || undefined, endDate || undefined, search || undefined, cursor.cursor);

  // users (page numbered)
  const [usersPage, setUsersPage] = useState(1);
  const [usersPageSize, setUsersPageSize] = useState(10);
  const users = useAdminOtcUsers(usersPage, usersPageSize);

  // revoke: ask first, then do it, and say if it failed
  const [confirming, setConfirming] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  const revoke = async (user: AdminUser) => {
    setRevoking(user.id);
    setRevokeError(null);
    try {
      await adminApi.updateUserFlags(user.id, { isOTCEnabled: false });
      setConfirming(null);
      await queryClient.invalidateQueries({ queryKey: ["admin-otc-users"] });
    } catch (e) {
      const message = (e as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message ?? (e as Error)?.message ?? "Unknown error";
      setRevokeError(`Couldn't revoke OTC access for ${user.email}: ${message}`);
    } finally {
      setRevoking(null);
    }
  };

  const submitSearch = (e: FormEvent) => {
    e.preventDefault();
    setSearch(draft.trim());
    cursor.reset();
  };
  const filter = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    cursor.reset();
  };

  const txColumns: Column<AdminOtcTransaction>[] = [
    { key: "date", header: "Date", cell: (t) => <span className="text-(--c-muted)">{format(new Date(t.createdAt), "MMM d, HH:mm")}</span>, className: "whitespace-nowrap" },
    {
      key: "ref",
      header: "Reference",
      cell: (t) => (
        <span className="block min-w-0">
          <span onClick={(e) => e.stopPropagation()}>
            <CopyableId value={t.reference} label="reference" />
          </span>
          <span className="block truncate text-xs text-(--c-muted)">{t.userEmail || "Unknown user"}</span>
        </span>
      ),
    },
    { key: "received", header: "Received", align: "right", cell: (t) => (t.fiatAmountReceived ? <Money value={String(t.fiatAmountReceived)} currency="NGN" /> : <span className="text-(--c-muted)">—</span>) },
    { key: "status", header: "Status", cell: (t) => <StatusBadge status={t.status} /> },
    {
      key: "manage",
      header: <span className="sr-only">Manage</span>,
      align: "right",
      cell: (t) => (
        <Link href={`/admin/otc/transactions/${t.reference}`} onClick={(e) => e.stopPropagation()} aria-label={`Manage ${t.reference}`} className="text-(--c-signal-text) underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-(--c-signal)">
          Manage
        </Link>
      ),
    },
  ];

  const userColumns: Column<AdminUser>[] = [
    {
      key: "user",
      header: "User",
      cell: (u) => (
        <span className="block min-w-0">
          <span className="block truncate font-medium">{u.email}</span>
        </span>
      ),
    },
    { key: "status", header: "Status", cell: (u) => <StatusBadge status={u.suspended ? "SUSPENDED" : "ACTIVE"} /> },
    { key: "joined", header: "Joined", cell: (u) => <span className="text-(--c-muted)">{format(new Date(u.createdAt), "MMM d, yyyy")}</span>, className: "whitespace-nowrap" },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (u) =>
        confirming === u.id ? (
          <span className="inline-flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <span className="text-(--c-muted)">Remove OTC access?</span>
            <button type="button" disabled={revoking === u.id} onClick={() => revoke(u)} className="rounded-(--c-radius) bg-(--c-danger) px-2 py-1 font-medium text-(--c-bg) disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--c-signal)">
              {revoking === u.id ? "Removing…" : "Yes, revoke"}
            </button>
            <button type="button" disabled={revoking === u.id} onClick={() => setConfirming(null)} className="rounded-(--c-radius) border border-(--c-line) px-2 py-1 font-medium focus-visible:outline-2 focus-visible:outline-(--c-signal)">
              Cancel
            </button>
          </span>
        ) : (
          <span className="inline-flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => { setRevokeError(null); setConfirming(u.id); }} aria-label={`Revoke OTC access for ${u.email}`} className="text-(--c-danger) underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-(--c-signal)">
              Revoke
            </button>
            <Link href={`/admin/users/${u.id}`} aria-label={`View ${u.email}`} className="text-(--c-signal-text) underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-(--c-signal)">
              View
            </Link>
          </span>
        ),
    },
  ];

  const refreshing = tab === "users" ? users.isFetching : tx.isFetching;
  const txFiltered = !!search || status !== "all" || !!startDate || !!endDate;

  return (
    <div className="space-y-5">
      <PageHeader
        title="OTC service"
        description="Who can trade over the counter, and every OTC trade."
        actions={
          <button
            type="button"
            onClick={() => (tab === "users" ? users.refetch() : tx.refetch())}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-(--c-radius) border border-(--c-line) bg-(--c-field) px-3 py-1.5 font-medium transition-colors hover:bg-(--c-raised) disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--c-signal)"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden />
            Refresh
          </button>
        }
      />

      <div>
        <SegmentedTabs label="OTC views" idPrefix="otc" tabs={TABS} value={tab} onChange={setTab} />

        <TabPanel value="transactions" current={tab} idPrefix="otc">
          <div className="space-y-3 pt-3">
            <FilterBar label="Filter OTC transactions">
              <form onSubmit={submitSearch} role="search" className="relative w-full max-w-xs">
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
                  <button type="button" aria-label="Clear search" onClick={() => { setDraft(""); setSearch(""); cursor.reset(); }} className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-1 text-(--c-muted) hover:text-(--c-text) focus-visible:outline-2 focus-visible:outline-(--c-signal)">
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                ) : null}
              </form>
              <SelectField label="Status" value={status} options={STATUSES} onChange={(e) => filter(setStatus)(e.target.value)} />
              <label className="inline-flex items-center gap-1.5 text-(--c-muted)">
                From
                <input type="date" value={startDate} onChange={(e) => filter(setStartDate)(e.target.value)} className={dateInput} />
              </label>
              <label className="inline-flex items-center gap-1.5 text-(--c-muted)">
                To
                <input type="date" value={endDate} onChange={(e) => filter(setEndDate)(e.target.value)} className={dateInput} />
              </label>
            </FilterBar>

            <DataTable
              caption="OTC transactions"
              columns={txColumns}
              rows={tx.data?.transactions}
              getRowId={(t) => t.id}
              isLoading={tx.isLoading}
              error={tx.error as { message?: string } | null}
              errorTitle="Couldn't load OTC transactions"
              onRetry={() => tx.refetch()}
              emptyTitle={txFiltered ? "No OTC transactions match these filters" : "No OTC transactions yet"}
              onRowClick={(t) => router.push(`/admin/otc/transactions/${t.reference}`)}
              footer={
                <CursorPagination
                  pageIndex={cursor.pageNumber}
                  pageSize={pageSize}
                  total={tx.data?.total}
                  hasNewer={cursor.canGoPrevious}
                  hasOlder={!!tx.data?.hasMore && !!tx.data?.nextCursor}
                  onNewer={cursor.goPrevious}
                  onOlder={() => tx.data?.nextCursor && cursor.goNext(tx.data.nextCursor)}
                  onPageSizeChange={(n) => {
                    setPageSize(n);
                    cursor.reset();
                  }}
                  disabled={tx.isFetching}
                />
              }
            />
          </div>
        </TabPanel>

        <TabPanel value="users" current={tab} idPrefix="otc">
          <div className="space-y-3 pt-3">
            {revokeError ? (
              <p role="alert" className="rounded-(--c-radius) border border-(--c-danger) px-3 py-2 text-(--c-danger)">
                {revokeError}
              </p>
            ) : null}
            <DataTable
              caption="OTC-enabled accounts"
              columns={userColumns}
              rows={users.data?.users}
              getRowId={(u) => u.id}
              isLoading={users.isLoading}
              error={users.error as { message?: string } | null}
              errorTitle="Couldn't load OTC users"
              onRetry={() => users.refetch()}
              emptyTitle="No OTC users yet"
              emptyHint="Turn on OTC access for someone from their page under Users."
              footer={
                <Pagination
                  page={usersPage}
                  pageSize={usersPageSize}
                  total={users.data?.pagination?.total ?? 0}
                  onPageChange={setUsersPage}
                  onPageSizeChange={(n) => {
                    setUsersPageSize(n);
                    setUsersPage(1);
                  }}
                  disabled={users.isFetching}
                />
              }
            />
          </div>
        </TabPanel>
      </div>
    </div>
  );
}
