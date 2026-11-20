"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Search, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { DataTable, FilterBar, PageHeader, Pagination, SegmentedTabs, SelectField, StatusBadge, type Column } from "@/components/ui-shared";
import { applyUserFilters, serverIgnoredRole, userStatusKey, type UserRoleFilter, type UserStatusFilter } from "@/components/admin/users/filters";
import { adminApi, type AdminUser } from "@/lib/api";
import { useAuthStore } from "@/lib/store";

const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
];
const ROLES = [
  { value: "all", label: "All roles" },
  { value: "admin", label: "Admins" },
  { value: "user", label: "Users" },
];

export default function AdminUsersPage() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<UserStatusFilter>("all");
  const [role, setRole] = useState<UserRoleFilter>("all");

  const query = useQuery({
    queryKey: ["admin-users", page, pageSize, search, status, role],
    queryFn: async () => (await adminApi.getUsers(page, pageSize, search, status === "all" ? undefined : status, role === "all" ? undefined : role)).data,
    enabled: !!token,
  });

  const rows = query.data ? applyUserFilters(query.data.users ?? [], status, role) : undefined;
  // If the server ignored the role filter its totals describe all users, so show only what we filtered, on one page.
  const ignored = !!query.data && serverIgnoredRole(query.data.users ?? [], role);
  const total = ignored ? (rows?.length ?? 0) : (query.data?.pagination?.total ?? 0);

  const change = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSearch(draft.trim());
    setPage(1);
  };

  const columns: Column<AdminUser>[] = [
    {
      key: "user",
      header: "User",
      cell: (u) => (
        <span className="block min-w-0">
          <span className="block truncate font-medium">{u.email}</span>
          {u.phoneNumber ? <span className="block text-xs text-(--c-muted)">{u.phoneNumber}</span> : null}
        </span>
      ),
    },
    { key: "role", header: "Role", cell: (u) => <span className="capitalize">{String(u.role ?? "").toLowerCase()}</span> },
    { key: "status", header: "Status", cell: (u) => <StatusBadge status={userStatusKey(u)} /> },
    { key: "joined", header: "Joined", cell: (u) => <span className="text-(--c-muted)">{format(new Date(u.createdAt), "MMM d, yyyy")}</span>, className: "whitespace-nowrap" },
    {
      key: "view",
      header: <span className="sr-only">Open</span>,
      align: "right",
      cell: (u) => (
        <Link href={`/admin/users/${u.id}`} onClick={(e) => e.stopPropagation()} className="text-(--c-signal-text) underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-(--c-signal)" aria-label={`View ${u.email}`}>
          View
        </Link>
      ),
    },
  ];

  const filtered = !!search || status !== "all" || role !== "all";

  return (
    <div className="space-y-5">
      <PageHeader title="Users" description="Everyone who has registered, and whether their account is active." />

      <SegmentedTabs label="Account status" idPrefix="users" tabs={STATUS_TABS} value={status} onChange={(v) => change(setStatus)(v as UserStatusFilter)} />

      <FilterBar label="Filter users">
        <form onSubmit={submit} role="search" className="relative w-full max-w-sm">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-(--c-muted)" />
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Find by email or phone"
            aria-label="Find by email or phone"
            autoComplete="off"
            className="h-8 w-full rounded-(--c-radius) border border-(--c-line) bg-(--c-field) pr-8 pl-8 placeholder:text-(--c-muted) focus-visible:border-(--c-signal) focus-visible:outline-none"
          />
          {draft || search ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setDraft("");
                setSearch("");
                setPage(1);
              }}
              className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-1 text-(--c-muted) hover:text-(--c-text) focus-visible:outline-2 focus-visible:outline-(--c-signal)"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          ) : null}
        </form>
        <SelectField label="Role" value={role} options={ROLES} onChange={(e) => change(setRole)(e.target.value as UserRoleFilter)} />
      </FilterBar>

      <DataTable
        caption="Users"
        columns={columns}
        rows={rows}
        getRowId={(u) => u.id}
        isLoading={query.isLoading}
        error={query.error as { message?: string } | null}
        errorTitle="Couldn't load users"
        onRetry={() => query.refetch()}
        emptyTitle={filtered ? "No users match these filters" : "No users yet"}
        emptyHint={filtered ? "Try a different status, role or search." : undefined}
        onRowClick={(u) => router.push(`/admin/users/${u.id}`)}
        footer={
          <Pagination
            page={ignored ? 1 : page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={change(setPageSize)}
            disabled={query.isFetching}
          />
        }
      />
    </div>
  );
}
