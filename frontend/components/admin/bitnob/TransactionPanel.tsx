"use client";

import Link from "next/link";
import { format } from "date-fns";
import { ArrowUpRight } from "lucide-react";
import { CopyableId, DetailList, Money, SidePanel, StatusBadge } from "@/components/ui-shared";
import { autoRampTransactionHref, bitnobTypeLabel, isAutoRampReference, parseBitnobAmount } from "@/lib/bitnob-format";
import type { BitnobTransaction } from "@/lib/hooks/use-admin-bitnob";

const when = (iso?: string, withSeconds = false) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : format(d, withSeconds ? "MMM d, yyyy HH:mm:ss" : "MMM d, yyyy HH:mm");
};

const humanizeKey = (key: string) => {
  const words = key.replace(/[_-]+/g, " ").trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** One Bitnob ledger record, in a pull-out. Our own references link straight to the AutoRamp transaction. */
export function BitnobTransactionPanel({ tx, onClose }: { tx: BitnobTransaction | null; onClose: () => void }) {
  const amount = tx ? parseBitnobAmount(tx) : null;
  const fee = tx ? parseBitnobAmount({ amount_formatted: tx.fee_formatted, currency: tx.currency }) : null;
  const ours = isAutoRampReference(tx?.reference);

  return (
    <SidePanel
      open={!!tx}
      onOpenChange={(open) => !open && onClose()}
      title={tx ? bitnobTypeLabel(tx.type) : "Transaction"}
      description={tx ? when(tx.created_at, true) : undefined}
      footer={
        tx && tx.reference ? (
          ours ? (
            <Link
              href={autoRampTransactionHref(tx.reference)}
              className="inline-flex items-center gap-1.5 rounded-(--c-radius) bg-(--c-signal) px-3 py-1.5 font-medium text-(--c-signal-ink) transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--c-signal)"
            >
              Open the AutoRamp transaction
              <ArrowUpRight className="h-4 w-4" aria-hidden />
            </Link>
          ) : (
            <p className="text-(--c-muted)">This is a record Bitnob created, so there is no AutoRamp transaction with this reference to open.</p>
          )
        ) : undefined
      }
    >
      {tx && amount ? (
        <div className="space-y-5">
          <div className="flex items-end justify-between gap-3">
            <p className="text-2xl font-semibold">
              {amount.value === null ? "—" : <Money value={amount.value} currency={amount.currency} direction={amount.direction ?? undefined} maxFraction={6} minFraction={2} />}
            </p>
            <StatusBadge status={tx.state} />
          </div>
          <DetailList
            items={[
              { label: "Reference", value: <CopyableId value={tx.reference} label="reference" /> },
              { label: "Transaction id", value: <CopyableId value={tx.transaction_id} label="transaction id" /> },
              ...(tx.trade_id ? [{ label: "Trade id", value: <CopyableId value={tx.trade_id} label="trade id" /> }] : []),
              { label: "Direction", value: amount.direction === "in" ? "Money in" : amount.direction === "out" ? "Money out" : "—" },
              { label: "Fee", value: fee?.value ? <Money value={fee.value} currency={fee.currency} maxFraction={6} minFraction={2} /> : "—" },
              { label: "Account", value: tx.account_number ?? "—" },
              { label: "Value date", value: tx.value_date ?? "—" },
              { label: "Last updated", value: when(tx.updated_at) },
              ...Object.entries(tx.metadata ?? {}).map(([key, value]) => ({
                label: humanizeKey(key),
                value: /id$|hash$|reference$/i.test(key) ? <CopyableId value={String(value)} label={humanizeKey(key).toLowerCase()} /> : String(value),
              })),
            ]}
          />
        </div>
      ) : null}
    </SidePanel>
  );
}
