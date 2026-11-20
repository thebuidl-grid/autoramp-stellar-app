import { Money, Sparkline } from "@/components/ui-shared";
import type { TransactionsSummaryResponse } from "@/lib/api";
import type { BitnobBalanceAccount } from "@/lib/hooks/use-admin-bitnob";

function Stat({ label, children, caption }: { label: string; children: React.ReactNode; caption?: React.ReactNode }) {
  return (
    <div className="min-w-0 flex-1 px-(--c-pad) py-3 sm:min-w-40">
      <dt className="text-(--c-muted)">{label}</dt>
      <dd className="mt-1 text-lg font-semibold">{children}</dd>
      {caption ? <p className="mt-0.5 text-xs text-(--c-muted)">{caption}</p> : null}
    </div>
  );
}

/**
 * Four numbers, one panel, divided by lines (not four identical cards): 30-day volume with its trend, how many payments and how
 * many succeeded, and what we hold at Bitnob. Anything that failed to load says so instead of showing a zero that looks real.
 */
export function MoneyStrip({
  summary,
  summaryError,
  trend,
  balances,
  balancesError,
  isLoading,
}: {
  summary?: TransactionsSummaryResponse;
  summaryError?: boolean;
  trend?: number[];
  balances?: BitnobBalanceAccount[];
  balancesError?: string;
  isLoading?: boolean;
}) {
  const unavailable = <span className="text-(--c-muted)">Unavailable</span>;
  const loading = <span className="inline-block h-5 w-20 animate-pulse rounded bg-(--c-field) align-middle motion-reduce:animate-none" aria-hidden />;
  const show = (value: React.ReactNode) => (isLoading ? loading : summaryError || !summary ? unavailable : value);
  const heldAtBitnob = (balances ?? []).filter((b) => b.currency && b.available_balance_formatted);

  return (
    <section aria-label="Money, last 30 days" className="overflow-hidden rounded-(--c-radius) border border-(--c-line) bg-(--c-panel)">
      <dl className="flex flex-wrap divide-x divide-y divide-(--c-line) sm:divide-y-0">
        <Stat label="Volume, last 30 days" caption={trend && trend.length > 1 ? <Sparkline values={trend} label="Daily volume trend" width={120} height={24} /> : undefined}>
          {show(<Money value={String(summary?.totalVolume ?? 0)} currency="NGN" maxFraction={0} />)}
        </Stat>
        <Stat label="Transactions">{show(<span className="tabular-nums">{(summary?.totalCount ?? 0).toLocaleString("en-US")}</span>)}</Stat>
        <Stat label="Success rate">{show(<span className="tabular-nums">{Math.round(summary?.successRate ?? 0)}%</span>)}</Stat>
        <Stat label="Held at Bitnob" caption={balancesError ? undefined : heldAtBitnob.length > 3 ? `and ${heldAtBitnob.length - 3} more` : undefined}>
          {balancesError ? (
            <span title={balancesError} className="text-(--c-muted)">
              Unavailable
            </span>
          ) : isLoading ? (
            loading
          ) : heldAtBitnob.length === 0 ? (
            <span className="text-(--c-muted)">No balances</span>
          ) : (
            <span className="flex flex-col gap-0.5 text-base">
              {heldAtBitnob.slice(0, 3).map((b) => (
                <Money key={b.account_id ?? b.currency} value={b.available_balance_formatted} currency={b.currency} maxFraction={b.currency === "BTC" ? 8 : 2} minFraction={0} />
              ))}
            </span>
          )}
        </Stat>
      </dl>
    </section>
  );
}
