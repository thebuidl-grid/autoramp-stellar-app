import { ChevronRight } from "lucide-react";
import { ProviderBadge, StatusBadge, providerName } from "@/components/ui-shared";
import { cn } from "@/lib/utils";
import { legTone, orderLegs, type LegTone, type TraceLeg } from "@/lib/tracker";

const TONE: Record<LegTone, { box: string; dot: string; label: string }> = {
  ok: { box: "border-(--c-ok)/50", dot: "bg-(--c-ok)", label: "Done" },
  live: { box: "border-(--c-signal)/60", dot: "bg-(--c-signal) motion-safe:animate-pulse", label: "In progress" },
  danger: { box: "border-(--c-danger)", dot: "bg-(--c-danger)", label: "Failed" },
  idle: { box: "border-(--c-line)", dot: "bg-transparent border border-(--c-line)", label: "Not started" },
};

const ROLE_LABEL: Record<string, string> = {
  FUNDING: "Funding",
  BRIDGE: "Bridge",
  CONVERSION: "Conversion",
  PAYOUT: "Payout",
  SETTLEMENT: "Settlement",
};

/**
 * Who handled this transaction, in the order money moves: one block per provider leg, joined by arrows, coloured by how that leg
 * went, with the step it failed at marked on the block. The state is also written out, so colour is never the only signal.
 */
export function TraceRibbon({ legs, transactionStatus }: { legs: TraceLeg[]; transactionStatus?: string }) {
  if (legs.length === 0) {
    return <p className="text-(--c-muted)">No provider has been recorded for this transaction yet.</p>;
  }
  const ordered = orderLegs(legs);

  return (
    <ol aria-label="Provider legs, in the order money moves" className="flex flex-wrap items-stretch gap-y-2">
      {ordered.map((leg, i) => {
        const tone = legTone(leg, transactionStatus);
        const styles = TONE[tone];
        return (
          <li key={leg.id} className="flex items-center" data-tone={tone}>
            <div className={cn("min-w-40 rounded-(--c-radius) border bg-(--c-panel) px-3 py-2", styles.box)}>
              <div className="flex items-center gap-2">
                <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", styles.dot)} />
                <span className="font-medium">{providerName(leg.provider)}</span>
              </div>
              <p className="mt-0.5 text-xs text-(--c-muted)">
                {ROLE_LABEL[leg.role] ?? leg.role} · {styles.label}
              </p>
              {leg.status ? <p className="mt-1 text-xs text-(--c-muted)">{leg.status}</p> : null}
              {leg.failedStep ? (
                <p className="mt-1 text-xs font-medium text-(--c-danger)">
                  <span aria-hidden>×</span> Failed at {leg.failedStep.replace(/_/g, " ")}
                </p>
              ) : null}
            </div>
            {i < ordered.length - 1 ? <ChevronRight aria-hidden className="mx-1 h-4 w-4 shrink-0 text-(--c-muted)" /> : null}
          </li>
        );
      })}
    </ol>
  );
}

/** Used by the list pages: a compact "who touched it" cell. */
export function ProviderChips({ providers }: { providers: Array<{ provider: string; role: string; failedStep?: string | null }> }) {
  if (providers.length === 0) return <span className="text-(--c-muted)">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {providers.map((p) => (
        <span key={`${p.provider}-${p.role}`} className={cn(p.failedStep && "text-(--c-danger)")}>
          <ProviderBadge provider={p.provider} role={p.role} />
        </span>
      ))}
    </span>
  );
}

export { StatusBadge };
