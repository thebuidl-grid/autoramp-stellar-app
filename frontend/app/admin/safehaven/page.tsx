"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { Search } from "lucide-react";
import { CopyableId, DataTable, DetailList, FilterBar, Money, PageHeader, Pagination, SegmentedTabs, SelectField, SidePanel, StatusBadge, type Column } from "@/components/ui-shared";
import { isAutoRampReference } from "@/lib/bitnob-format";
import { errorMessage } from "@/lib/hooks/use-admin-tracker";
import { useSafehavenAccount, useSafehavenAccounts, useSafehavenTransactions } from "@/lib/hooks/use-admin-safehaven";
import { useDebounce } from "@/lib/hooks";
import { KIND_LABEL, accountOwner, type SafehavenAccount, type SafehavenEvent, type SafehavenTransaction } from "@/lib/safehaven";
import { traceUrl } from "@/lib/tracker";

const TABS = [
  { value: "accounts", label: "Customer accounts" },
  { value: "merchants", label: "Merchant accounts" },
  { value: "transactions", label: "Transactions" },
];

const CUSTOMER_KINDS = [
  { value: "", label: "All customer accounts" },
  { value: "user_deposit", label: "Deposit accounts" },
  { value: "virtual", label: "Virtual accounts" },
];
const MERCHANT_KINDS = [
  { value: "merchant_sub", label: "Sub-accounts" },
  { value: "merchant_main", label: "Main accounts" },
];
const MATCH = [
  { value: "", label: "All" },
  { value: "matched", label: "Tied to a transaction" },
  { value: "unmatched", label: "Not matched" },
];

const when = (iso: string | null) => (iso ? format(new Date(iso), "MMM d, HH:mm") : "—");
const naira = (v: string | null) => (v ? <Money value={v} currency="NGN" maxFraction={2} minFraction={2} /> : <span className="text-(--c-muted)">—</span>);

function EventList({ events, accountNumber }: { events: SafehavenEvent[]; accountNumber: string }) {
  if (events.length === 0) return <p className="text-(--c-muted)">Nothing has been paid into or out of this account yet.</p>;
  return (
    <ul className="divide-y divide-(--c-line)">
      {events.map((e) => {
        const incoming = e.creditAccountNumber === accountNumber;
        return (
          <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
            <div>
              <p className="font-medium">
                {incoming ? "Money in" : "Money out"} · {naira(e.amount)}
              </p>
              <p className="text-xs text-(--c-muted)">
                {e.eventType ?? "Event"} · {format(new Date(e.createdAt), "MMM d, HH:mm:ss")}
                {e.transactionId ? "" : " · not matched to a transaction"}
                {!e.processed ? " · not processed" : ""}
              </p>
              {e.errorMessage ? <p className="text-xs text-(--c-danger)">{e.errorMessage}</p> : null}
              {e.reference && isAutoRampReference(e.reference) ? (
                <Link href={traceUrl(e.reference)} className="text-xs text-(--c-signal) underline underline-offset-2">
                  Trace {e.reference}
                </Link>
              ) : null}
            </div>
            {e.status ? <StatusBadge status={e.status} /> : null}
          </li>
        );
      })}
    </ul>
  );
}

function AccountPanel({ accountNumber, onClose }: { accountNumber: string | null; onClose: () => void }) {
  const detail = useSafehavenAccount(accountNumber);
  const a = detail.data?.account;
  return (
    <SidePanel open={!!accountNumber} onOpenChange={(o) => !o && onClose()} title={a ? (a.accountName ?? a.accountNumber) : "Account"} description={a ? KIND_LABEL[a.kind] : undefined}>
      {detail.isLoading ? (
        <div role="status" aria-label="Loading account" className="h-24 animate-pulse rounded-(--c-radius) bg-(--c-field) motion-reduce:animate-none" />
      ) : detail.isError ? (
        <p role="alert" className="text-(--c-danger)">
          Couldn&apos;t load this account: {errorMessage(detail.error)}
        </p>
      ) : a ? (
        <div className="space-y-5">
          <DetailList
            items={[
              { label: "Account number", value: <CopyableId value={a.accountNumber} label="account number" /> },
              ...(a.bankName ? [{ label: "Bank", value: a.bankCode ? `${a.bankName} (${a.bankCode})` : a.bankName }] : []),
              ...(accountOwner(a) ? [{ label: "Belongs to", value: a.userId ? <Link className="underline underline-offset-2" href={`/admin/users/${a.userId}`}>{accountOwner(a)}</Link> : a.merchantId ? <Link className="underline underline-offset-2" href={`/admin/merchants/${a.merchantId}`}>{accountOwner(a)}</Link> : accountOwner(a) }] : []),
              ...(a.status ? [{ label: "Status", value: <StatusBadge status={a.status} /> }] : []),
              ...(a.expiresAt ? [{ label: "Expires", value: when(a.expiresAt) }] : []),
              { label: "Created", value: when(a.createdAt) },
              { label: "Events", value: `${a.events}${a.unmatched ? ` (${a.unmatched} not matched)` : ""}` },
            ]}
          />
          <section className="space-y-2">
            <h3 className="font-medium">Activity on this account</h3>
            <EventList events={detail.data!.events} accountNumber={a.accountNumber} />
          </section>
        </div>
      ) : null}
    </SidePanel>
  );
}

function TransactionPanel({ tx, onClose }: { tx: SafehavenTransaction | null; onClose: () => void }) {
  return (
    <SidePanel open={!!tx} onOpenChange={(o) => !o && onClose()} title={tx ? (tx.eventType ?? "Safehaven event") : "Safehaven event"} description={tx ? format(new Date(tx.createdAt), "MMM d, yyyy HH:mm:ss") : undefined}>
      {tx ? (
        <div className="space-y-5">
          <div className="flex items-end justify-between gap-3">
            <p className="text-3xl font-semibold tabular-nums">{naira(tx.amount)}</p>
            {tx.status ? <StatusBadge status={tx.status} /> : null}
          </div>
          <DetailList
            items={[
              { label: "From", value: tx.debitAccountNumber ? `${tx.debitAccountName ?? ""} ${tx.debitAccountNumber}`.trim() : "—" },
              { label: "To", value: tx.creditAccountNumber ? `${tx.creditAccountName ?? ""} ${tx.creditAccountNumber}`.trim() : "—" },
              { label: "Tied to", value: tx.ourReference ? <CopyableId value={tx.ourReference} label="our reference" /> : <span className="text-(--c-warn)">No transaction of ours</span> },
              { label: "Session id", value: <CopyableId value={tx.sessionId} label="session id" /> },
              { label: "Payment reference", value: <CopyableId value={tx.paymentReference} label="payment reference" /> },
              { label: "External reference", value: <CopyableId value={tx.externalReference} label="external reference" /> },
              { label: "Processed", value: tx.processed ? "Yes" : <span className="text-(--c-warn)">No</span> },
              ...(tx.errorMessage ? [{ label: "Error", value: <span className="text-(--c-danger)">{tx.errorMessage}</span> }] : []),
            ]}
          />
          {tx.ourReference ? (
            <Link href={traceUrl(tx.ourReference)} className="inline-block rounded-(--c-radius) bg-(--c-signal) px-3 py-1.5 font-medium text-(--c-signal-ink) hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--c-signal)">
              Trace this transaction
            </Link>
          ) : null}
        </div>
      ) : null}
    </SidePanel>
  );
}

/** Safehaven in one place: the accounts we hold for customers and merchants, and the money moving through them. */
export default function AdminSafehavenPage() {
  return (
    <Suspense fallback={null}>
      <SafehavenFromUrl />
    </Suspense>
  );
}

/** Opens on a tab and search from the link (?tab=accounts|merchants|transactions, ?q=), which the trace page uses. */
function SafehavenFromUrl() {
  const params = useSearchParams();
  const q = params?.get("q")?.trim() ?? "";
  const tabParam = params?.get("tab") ?? "";
  const tab = TABS.some((t) => t.value === tabParam) ? tabParam : "accounts";
  return <SafehavenContent key={`${tab}|${q}`} initialTab={tab} initialSearch={q} />;
}

function SafehavenContent({ initialTab, initialSearch }: { initialTab: string; initialSearch: string }) {
  const [tab, setTab] = useState(initialTab);
  const [kind, setKind] = useState("");
  const [merchantKind, setMerchantKind] = useState("merchant_sub");
  const [match, setMatch] = useState("");
  const [search, setSearch] = useState(initialSearch);
  const q = useDebounce(search.trim(), 300) || undefined;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [account, setAccount] = useState<string | null>(null);
  const [tx, setTx] = useState<SafehavenTransaction | null>(null);

  const paging = { limit: pageSize, offset: (page - 1) * pageSize };
  const accountKind = tab === "merchants" ? merchantKind : kind || "customer";
  const showAccounts = tab !== "transactions";
  const accounts = useSafehavenAccounts({ kind: accountKind, q, ...paging }, showAccounts);
  const transactions = useSafehavenTransactions({ matched: match === "" ? undefined : match === "matched", q, ...paging }, !showAccounts);
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  const accountColumns: Column<SafehavenAccount>[] = [
    { key: "num", header: "Account", cell: (a) => <span className="font-mono">{a.accountNumber}</span> },
    { key: "name", header: "Name", cell: (a) => <span className="block max-w-56 truncate">{a.accountName ?? "—"}</span> },
    { key: "owner", header: "Belongs to", cell: (a) => <span className="block max-w-48 truncate">{accountOwner(a) ?? "—"}</span> },
    { key: "kind", header: "Type", cell: (a) => <span className="text-(--c-muted)">{KIND_LABEL[a.kind]}</span> },
    { key: "events", header: "Events", cell: (a) => (a.unmatched > 0 ? <span>{a.events} <span className="text-(--c-warn)">({a.unmatched} not matched)</span></span> : a.events), className: "tabular-nums" },
    { key: "last", header: "Last activity", cell: (a) => <span className="text-(--c-muted)">{when(a.lastEventAt)}</span>, className: "whitespace-nowrap" },
  ];

  const txColumns: Column<SafehavenTransaction>[] = [
    { key: "when", header: "When", cell: (t) => <span className="text-(--c-muted)">{when(t.createdAt)}</span>, className: "whitespace-nowrap" },
    { key: "dir", header: "Event", cell: (t) => t.eventType ?? "—" },
    { key: "amount", header: "Amount", cell: (t) => naira(t.amount), className: "text-right tabular-nums" },
    { key: "acct", header: "Account", cell: (t) => <span className="font-mono">{t.creditAccountNumber ?? t.debitAccountNumber ?? "—"}</span> },
    { key: "status", header: "Status", cell: (t) => (t.status ? <StatusBadge status={t.status} /> : <span className="text-(--c-muted)">—</span>) },
    { key: "tied", header: "Tied to", cell: (t) => (t.ourReference ? <span className="font-mono text-xs">{t.ourReference}</span> : <StatusBadge status="UNMATCHED" tone="warn" label="Not matched" />) },
  ];


  return (
    <div className="space-y-5">
      <PageHeader title="Safehaven" description="Customer and merchant accounts, the money moving through them, and which transaction of ours each one belongs to." />
      <SegmentedTabs label="Safehaven views" idPrefix="sh" tabs={TABS} value={tab} onChange={reset(setTab)} />

      <FilterBar label="Filter Safehaven">
        <label className="relative">
          <span className="sr-only">Search</span>
          <Search className="pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-(--c-muted)" aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(e) => reset(setSearch)(e.target.value)}
            placeholder={showAccounts ? "Account number, name, email or merchant" : "Account, session or payment reference"}
            className="h-8 w-72 rounded-(--c-radius) border border-(--c-line) bg-(--c-field) pr-2 pl-7 focus-visible:outline-2 focus-visible:outline-(--c-signal)"
          />
        </label>
        {tab === "accounts" ? <SelectField label="Type" value={kind} options={CUSTOMER_KINDS} onChange={(e) => reset(setKind)(e.target.value)} /> : null}
        {tab === "merchants" ? <SelectField label="Type" value={merchantKind} options={MERCHANT_KINDS} onChange={(e) => reset(setMerchantKind)(e.target.value)} /> : null}
        {tab === "transactions" ? <SelectField label="Match" value={match} options={MATCH} onChange={(e) => reset(setMatch)(e.target.value)} /> : null}
      </FilterBar>

      {showAccounts ? (
        <DataTable
          caption={tab === "merchants" ? "Merchant accounts" : "Customer accounts"}
          columns={accountColumns}
          rows={accounts.data?.items}
          getRowId={(a) => `${a.kind}-${a.accountNumber}`}
          isLoading={accounts.isLoading}
          error={accounts.error ? { message: errorMessage(accounts.error) } : null}
          errorTitle="Couldn't load accounts"
          onRetry={() => accounts.refetch()}
          emptyTitle={q ? "No accounts match your search" : "No accounts here yet"}
          onRowClick={(a) => setAccount(a.accountNumber)}
          footer={<Pagination page={page} pageSize={pageSize} total={accounts.data?.total ?? 0} onPageChange={setPage} onPageSizeChange={reset(setPageSize)} disabled={accounts.isFetching} />}
        />
      ) : (
        <DataTable
          caption="Safehaven transactions"
          columns={txColumns}
          rows={transactions.data?.items}
          getRowId={(t) => t.id}
          isLoading={transactions.isLoading}
          error={transactions.error ? { message: errorMessage(transactions.error) } : null}
          errorTitle="Couldn't load Safehaven transactions"
          onRetry={() => transactions.refetch()}
          emptyTitle={match || q ? "No transactions match these filters" : "No Safehaven transactions yet"}
          emptyHint={match === "unmatched" ? "Every event is tied to one of our transactions." : undefined}
          onRowClick={(t) => setTx(t)}
          footer={<Pagination page={page} pageSize={pageSize} total={transactions.data?.total ?? 0} onPageChange={setPage} onPageSizeChange={reset(setPageSize)} disabled={transactions.isFetching} />}
        />
      )}

      <AccountPanel accountNumber={account} onClose={() => setAccount(null)} />
      <TransactionPanel tx={tx} onClose={() => setTx(null)} />
    </div>
  );
}
