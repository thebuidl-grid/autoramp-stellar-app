"use client";

import Link from "next/link";
import { format } from "date-fns";
import { ArrowUpRight } from "lucide-react";
import { CopyableId, DetailList, Money, SidePanel, StatusBadge, StatusTrack } from "@/components/ui-shared";
import type { PlatformTransaction } from "@/lib/api";
import { traceUrl } from "@/lib/tracker";
import { amountCurrency, trackKindFor, transactionTypeLabel } from "./labels";

/** One transaction from the platform list, in a pull-out. */
export function TransactionPanel({ tx, onClose }: { tx: PlatformTransaction | null; onClose: () => void }) {
  const kind = trackKindFor(tx?.type);
  const currency = tx ? amountCurrency(tx) : null;
  const created = tx ? new Date(tx.createdAt) : null;

  return (
    <SidePanel
      open={!!tx}
      onOpenChange={(open) => !open && onClose()}
      title={tx ? transactionTypeLabel(tx.type) : "Transaction"}
      description={created && !Number.isNaN(created.getTime()) ? format(created, "MMM d, yyyy HH:mm:ss") : undefined}
      footer={
        tx ? (
          <Link
            href={traceUrl(tx.reference)}
            className="inline-flex items-center gap-1.5 rounded-(--c-radius) bg-(--c-signal) px-3 py-1.5 font-medium text-(--c-signal-ink) transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--c-signal)"
          >
            Trace this transaction
            <ArrowUpRight className="h-4 w-4" aria-hidden />
          </Link>
        ) : undefined
      }
    >
      {tx ? (
        <div className="space-y-6">
          <div className="flex items-end justify-between gap-3">
            <p className="text-2xl font-semibold">
              <Money value={String(tx.amount)} currency={currency} maxFraction={currency === "NGN" ? 2 : 6} minFraction={2} />
            </p>
            <StatusBadge status={tx.status} />
          </div>

          {kind ? (
            <div>
              <StatusTrack kind={kind} status={tx.status} />
            </div>
          ) : null}

          <DetailList
            items={[
              { label: "Reference", value: <CopyableId value={tx.reference} label="reference" /> },
              { label: tx.merchant ? "Merchant" : "User", value: tx.user ?? tx.merchant ?? "System" },
              { label: "Type", value: transactionTypeLabel(tx.type) },
              { label: "Transaction id", value: <CopyableId value={tx.id} label="transaction id" /> },
            ]}
          />
          {currency === null ? <p className="text-xs text-(--c-muted)">The amount is shown without a currency because this list does not say which one it is in.</p> : null}
        </div>
      ) : null}
    </SidePanel>
  );
}
