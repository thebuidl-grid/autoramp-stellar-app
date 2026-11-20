import { format } from "date-fns";
import { CopyableId, Money, StatusBadge, StatusTrack } from "@/components/ui-shared";
import { amountCurrency, trackKindFor, transactionTypeLabel } from "@/components/admin/transactions/labels";
import Link from "next/link";
import { adminLinks, lastReachedStatus, type TraceHalf } from "@/lib/tracker";
import { MoneyPanel } from "./MoneyPanel";
import { VirtualAccountPanel } from "./VirtualAccountPanel";
import { NetworkBadge } from "./NetworkBadge";
import { LegsPanel } from "./LegsPanel";
import { Timeline } from "./Timeline";
import { TraceRibbon } from "./TraceRibbon";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-medium">{title}</h2>
      {children}
    </section>
  );
}

/** One transaction, traced: what it is, where it stopped (if it did), who handled it, and everything that happened. */
export function TraceHalfView({ half }: { half: TraceHalf }) {
  const { transaction: tx, legs, timeline, failedAt } = half;
  const kind = trackKindFor(tx.type);
  const currency = tx.currency ?? amountCurrency({ type: tx.type });
  // For an off-ramp, the headline describes the bank payout. The transaction
  // amount is the USDC input; money.expected/settled are the NGN output.
  const isOfframp = tx.type === "offramp" || tx.type === "merchant_offramp";
  const headlineAmount = isOfframp ? (half.money?.settled ?? half.money?.expected ?? null) : tx.amount;
  const headlineCurrency = isOfframp ? (tx.payoutCurrency ?? "NGN") : currency;
  const legCurrency = isOfframp ? (half.money?.sent?.currency ?? "USDC") : currency;

  return (
    <div className="space-y-6 pt-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-(--c-muted)">{transactionTypeLabel(tx.type)}</p>
          <p className="text-2xl font-semibold">
            {headlineAmount === null ? "—" : <Money value={headlineAmount} currency={headlineCurrency} maxFraction={headlineCurrency === "NGN" ? 2 : 6} minFraction={2} />}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 text-right">
          <div className="flex items-center gap-2">
            <NetworkBadge network={tx.chainNetwork} />
            <StatusBadge status={tx.status} />
          </div>
          <span className="text-xs text-(--c-muted)">Started {format(new Date(tx.createdAt), "MMM d, yyyy HH:mm")}</span>
        </div>
      </div>

      {kind ? <StatusTrack kind={kind} status={tx.status} reachedStatus={lastReachedStatus(timeline, tx.status)} /> : null}

      {failedAt ? (
        <div role="alert" className="rounded-(--c-radius) border border-(--c-danger) bg-[color-mix(in_oklab,var(--c-danger)_10%,transparent)] px-3 py-2">
          <p className="font-medium text-(--c-danger)">
            Failed at {failedAt.step.replace(/_/g, " ")}
            {failedAt.provider ? ` (${failedAt.provider})` : ""}
          </p>
          {failedAt.reason ? <p className="text-(--c-muted)">{failedAt.reason}</p> : null}
        </div>
      ) : null}

      {half.money && (half.money.fees.length > 0 || half.money.feeTotal || half.money.expected || half.money.settled) ? (
        <Section title="Fees and amounts">
          <MoneyPanel money={half.money} amount={tx.amount} currency={currency} payoutCurrency={tx.payoutCurrency} type={tx.type} />
        </Section>
      ) : null}

      {adminLinks(half).length > 0 ? (
        <Section title="See it elsewhere in the admin">
          <ul className="flex flex-wrap gap-2">
            {adminLinks(half).map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="inline-flex items-center rounded-(--c-radius) border border-(--c-line) px-3 py-1.5 font-medium hover:bg-(--c-field) focus-visible:outline-2 focus-visible:outline-(--c-signal)">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {half.virtualAccount ? (
        <Section title="Safehaven account">
          <VirtualAccountPanel account={half.virtualAccount} transactionId={tx.id} currency={currency} />
        </Section>
      ) : null}

      <Section title="Who handled it">
        <TraceRibbon legs={legs} transactionStatus={tx.status} />
      </Section>

      {legs.length > 0 ? (
        <Section title="Provider details">
          <LegsPanel legs={legs} currency={legCurrency} />
        </Section>
      ) : null}

      <Section title="What happened">
        <Timeline entries={timeline} />
      </Section>

      <p className="text-xs text-(--c-muted)">
        Transaction id <CopyableId value={tx.id} label="transaction id" />
        {tx.ownerId ? (
          <>
            {" · "}
            {tx.scope === "MERCHANT" ? "Merchant" : "User"} id <CopyableId value={tx.ownerId} label={tx.scope === "MERCHANT" ? "merchant id" : "user id"} />
          </>
        ) : null}
      </p>
    </div>
  );
}
