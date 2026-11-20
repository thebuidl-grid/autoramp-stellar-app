import { Money } from "@/components/ui-shared";
import type { TransactionsSummaryResponse } from "@/lib/api";

function Stat({ label, children, caption }: { label: string; children: React.ReactNode; caption?: React.ReactNode }) {
  return (
    <div className="min-w-0 flex-1 px-(--c-pad) py-3 sm:min-w-44">
      <dt className="text-(--c-muted)">{label}</dt>
      <dd className="mt-1 text-lg font-semibold">{children}</dd>
      {caption ? <p className="mt-0.5 text-xs text-(--c-muted)">{caption}</p> : null}
    </div>
  );
}

/** The period's headline numbers in one panel. A failed load says Unavailable; it never shows a zero that looks real. */
export function SummaryStrip({ summary, isLoading, isError, periodLabel }: { summary?: TransactionsSummaryResponse; isLoading?: boolean; isError?: boolean; periodLabel: string }) {
  const bad = isError || (!isLoading && !summary);
  const value = (node: React.ReactNode) =>
    isLoading ? <span aria-hidden className="inline-block h-5 w-24 animate-pulse rounded bg-(--c-field) align-middle motion-reduce:animate-none" /> : bad ? <span className="text-(--c-muted)">Unavailable</span> : node;
  const f = summary?.fees;

  return (
    <section aria-label={`Summary, ${periodLabel}`} className="overflow-hidden rounded-(--c-radius) border border-(--c-line) bg-(--c-panel)">
      <dl className="flex flex-wrap divide-x divide-y divide-(--c-line) sm:divide-y-0">
        <Stat label="Volume" caption="Across all types, in naira">
          {value(<Money value={String(summary?.totalVolume ?? 0)} currency="NGN" maxFraction={0} />)}
        </Stat>
        <Stat label="Net volume" caption="Onramp minus offramp">
          {value(<Money value={String(summary?.netVolume ?? 0)} currency="NGN" maxFraction={0} />)}
        </Stat>
        <Stat label="Transactions" caption={bad || isLoading ? undefined : `${Math.round(summary?.successRate ?? 0)}% succeeded`}>
          {value(<span className="tabular-nums">{(summary?.totalCount ?? 0).toLocaleString("en-US")}</span>)}
        </Stat>
        <Stat
          label="Fees collected"
          caption={
            !bad && !isLoading && f ? (
              <>
                Provider <Money value={String(f.provider_fee ?? 0)} currency="NGN" maxFraction={0} /> · VAT <Money value={String(f.vat ?? 0)} currency="NGN" maxFraction={0} /> · Stamp duty{" "}
                <Money value={String(f.stamp_duty ?? 0)} currency="NGN" maxFraction={0} />
              </>
            ) : undefined
          }
        >
          {value(<Money value={String(f?.total ?? 0)} currency="NGN" maxFraction={0} />)}
        </Stat>
      </dl>
    </section>
  );
}
