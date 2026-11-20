"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { adminApi } from "@/lib/api";
import { CopyableId, EmptyState, ErrorState, PageHeader, SegmentedTabs, TabPanel } from "@/components/ui-shared";
import { transactionTypeLabel } from "@/components/admin/transactions/labels";
import { TraceHalfView } from "@/components/admin/tracker/TraceHalfView";
import { errorMessage, errorStatus, useTrace } from "@/lib/hooks/use-admin-tracker";

function decode(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw; // a stray % is not a reason to fail
  }
}

/** Trace one transaction by reference: who handled it, what happened and when, and where it went wrong. */
export default function AdminTracePage() {
  const params = useParams<{ reference: string }>();
  const reference = decode(String(params?.reference ?? "")).trim();
  const trace = useTrace(reference);
  const [selected, setSelected] = useState<string | null>(null);
  const reconcile = useMutation({
    mutationFn: () => adminApi.reconcileOfframp(reference),
    onSuccess: async () => { await trace.refetch(); },
  });

  const halves = trace.data?.transactions ?? [];
  // A swap and its off-ramp share one reference: one tab each. The first half is shown until a tab is picked.
  const current = halves.find((h) => h.transaction.id === selected) ?? halves[0];

  return (
    <div className="space-y-5">
      <Link href="/admin/transactions" className="inline-flex items-center gap-1 text-(--c-muted) hover:text-(--c-text) focus-visible:outline-2 focus-visible:outline-(--c-signal)">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Transactions
      </Link>

      <PageHeader title="Trace" description={<CopyableId value={reference} label="reference" className="text-base" />} />

      {trace.isLoading ? (
        <div role="status" aria-label="Loading trace" className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-(--c-radius) bg-(--c-field) motion-reduce:animate-none" />
          ))}
        </div>
      ) : trace.isError && errorStatus(trace.error) === 404 ? (
        <div className="rounded-(--c-radius) border border-(--c-line) bg-(--c-panel)">
          <EmptyState
            title={`Nothing found for ${reference}`}
            hint="References have to match exactly. Off-ramp references start with off_ and others with txn_ref_. You can also search the list for part of it."
            action={
              <Link href={`/admin/transactions?q=${encodeURIComponent(reference)}`} className="mt-1 rounded-(--c-radius) border border-(--c-line) bg-(--c-field) px-3 py-1.5 font-medium hover:bg-(--c-raised) focus-visible:outline-2 focus-visible:outline-(--c-signal)">
                Search transactions for “{reference}”
              </Link>
            }
          />
        </div>
      ) : trace.isError ? (
        <div className="rounded-(--c-radius) border border-(--c-line) bg-(--c-panel)">
          <ErrorState title="Couldn't load this trace" message={errorMessage(trace.error)} onRetry={() => trace.refetch()} />
        </div>
      ) : current ? (
        <div>
          {halves.length > 1 ? (
            <>
              <p className="mb-2 text-(--c-muted)">This reference belongs to {halves.length} linked transactions, such as a swap and its off-ramp.</p>
              <SegmentedTabs
                label="Linked transactions"
                idPrefix="trace"
                tabs={halves.map((h) => ({ value: h.transaction.id, label: transactionTypeLabel(h.transaction.type) }))}
                value={current.transaction.id}
                onChange={setSelected}
              />
            </>
          ) : null}
          <TabPanel value={current.transaction.id} current={current.transaction.id} idPrefix="trace">
            {current.transaction.type === "offramp" || current.transaction.type === "merchant_offramp" ? (
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => reconcile.mutate()}
                  disabled={reconcile.isPending}
                  className="inline-flex items-center gap-2 rounded-(--c-radius) border border-(--c-line) bg-(--c-panel) px-3 py-1.5 font-medium hover:bg-(--c-field) disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-(--c-signal)"
                >
                  {reconcile.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
                  {reconcile.isPending ? "Checking payout…" : "Recheck payout"}
                </button>
                {reconcile.isSuccess ? <span role="status" className="text-sm text-(--c-muted)">{reconcile.data.data.message}</span> : null}
                {reconcile.isError ? <span role="alert" className="text-sm text-(--c-danger)">{errorMessage(reconcile.error) ?? "Couldn't recheck this payout."}</span> : null}
              </div>
            ) : null}
            <TraceHalfView half={current} />
          </TabPanel>
        </div>
      ) : null}

      {trace.data && trace.data.unlinkedWebhooks.length > 0 ? (
        <section aria-label="Webhook events not linked to this transaction" className="space-y-2">
          <h2 className="font-medium">Webhook events with this reference but no transaction</h2>
          <ul className="divide-y divide-(--c-line) rounded-(--c-radius) border border-(--c-line) bg-(--c-panel)">
            {trace.data.unlinkedWebhooks.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 px-(--c-pad) py-2">
                <span>
                  <span className="font-medium capitalize">{w.provider ?? "Unknown provider"}</span> <span className="text-(--c-muted)">{w.eventType ?? w.status ?? "event"}</span>
                </span>
                <span className="flex items-center gap-3 text-xs text-(--c-muted)">
                  <time dateTime={w.at}>{new Date(w.at).toLocaleString()}</time>
                  <CopyableId value={w.id} label="event id" />
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
