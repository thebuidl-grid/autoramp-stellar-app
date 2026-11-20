import { CopyableId, DetailList, Money, ProviderBadge, StatusBadge } from "@/components/ui-shared";
import { legTone, orderLegs, type TraceLeg } from "@/lib/tracker";

/** The facts about each provider leg: their reference, what we expected and received, where funds go, and why it failed. */
export function LegsPanel({ legs, currency }: { legs: TraceLeg[]; currency?: string | null }) {
  if (legs.length === 0) return null;
  return (
    <div className="space-y-4">
      {orderLegs(legs).map((leg) => {
        const tone = legTone(leg);
        const items = [
          { label: "Provider reference", value: <CopyableId value={leg.providerReference} label="provider reference" /> },
          ...(leg.expectedAmount ? [{ label: "Expected", value: <Money value={leg.expectedAmount} currency={currency} maxFraction={7} minFraction={2} /> }] : []),
          ...(leg.receivedAmount ? [{ label: "Received", value: <Money value={leg.receivedAmount} currency={currency} maxFraction={7} minFraction={2} /> }] : []),
          ...(leg.outstandingAmount && Number(leg.outstandingAmount) > 0 ? [{ label: "Still owed", value: <Money value={leg.outstandingAmount} currency={currency} maxFraction={7} minFraction={2} /> }] : []),
          ...(leg.fundingAddress ? [{ label: "Funding address", value: <CopyableId value={leg.fundingAddress} label="funding address" /> }] : []),
          ...(leg.depositTxHash ? [{ label: "Deposit hash", value: <CopyableId value={leg.depositTxHash} label="deposit hash" /> }] : []),
          ...(leg.failedStep ? [{ label: "Failed at", value: <span className="text-(--c-danger)">{leg.failedStep.replace(/_/g, " ")}</span> }] : []),
          ...(leg.failureReason ? [{ label: "Why", value: <span className="text-(--c-danger)">{leg.failureReason}</span> }] : []),
        ];
        return (
          <section key={leg.id} aria-label={`${leg.provider} ${leg.role}`} className="overflow-hidden rounded-(--c-radius) border border-(--c-line) bg-(--c-panel)">
            <header className="flex items-center justify-between gap-3 border-b border-(--c-line) px-(--c-pad) py-2">
              <ProviderBadge provider={leg.provider} role={leg.role} />
              {leg.status ? <StatusBadge status={leg.status} tone={tone === "danger" ? "danger" : undefined} /> : <span className="text-(--c-muted)">No status yet</span>}
            </header>
            <div className="px-(--c-pad)">
              <DetailList items={items} />
            </div>
          </section>
        );
      })}
    </div>
  );
}
