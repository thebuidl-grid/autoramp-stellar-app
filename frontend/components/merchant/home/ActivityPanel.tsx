"use client";

import { format } from "date-fns";
import { CopyableId, DetailList, Money, SidePanel, StatusBadge } from "@/components/ui-shared";
import type { UnifiedTransaction } from "@/lib/api";
import { activityCurrency, activityDetail, activityIds, activityLabel, feeBreakdown, feeName } from "./activity";

/** One payment in full: what it was, the amounts after fees, and every id you would quote to support or match against a statement. */
export function ActivityPanel({ tx, onClose }: { tx: UnifiedTransaction | null; onClose: () => void }) {
  const currency = tx ? activityCurrency(tx) : "NGN";
  const breakdown = tx ? feeBreakdown(tx.amount, currency, tx.fees) : null;
  const money = (v: string | number) => <Money value={v} currency={currency} maxFraction={currency === "NGN" ? 2 : 6} minFraction={2} />;

  return (
    <SidePanel
      theme="counter"
      open={!!tx}
      onOpenChange={(o) => !o && onClose()}
      title={tx ? activityLabel(tx.type) : ""}
      description={tx ? format(new Date(tx.createdAt), "MMM d, yyyy HH:mm") : undefined}
    >
      {tx ? (
        <div className="space-y-5">
          <div className="flex items-end justify-between gap-3">
            <p className="text-3xl font-semibold tabular-nums">{money(tx.amount)}</p>
            <StatusBadge status={tx.status} />
          </div>

          <DetailList
            items={[
              ...(activityDetail(tx) ? [{ label: "Details", value: activityDetail(tx) }] : []),
              ...(tx.fees ?? []).map((f) => ({ label: feeName(f.type), value: <Money value={f.amount} currency={f.currency} maxFraction={2} minFraction={2} /> })),
              ...(breakdown
                ? [
                    { label: "Fees in total", value: money(breakdown.total) },
                    { label: "After fees", value: <span className="font-medium">{money(breakdown.net)}</span> },
                  ]
                : []),
            ]}
          />

          <DetailList items={activityIds(tx).map((i) => ({ label: i.label, value: <CopyableId value={i.value} label={i.label.toLowerCase()} /> }))} />
        </div>
      ) : null}
    </SidePanel>
  );
}
