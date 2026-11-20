import { Money } from "@/components/ui-shared";
import type { TraceMoney } from "@/lib/tracker";

const FEE_LABEL: Record<string, string> = { provider_fee: "Provider fee", vat: "VAT", stamp_duty: "Stamp duty", platform_fee: "Platform fee" };
const feeLabel = (t: string) => FEE_LABEL[t] ?? t.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

function Row({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="text-(--c-muted)">
        {label}
        {hint ? <span className="block text-xs">{hint}</span> : null}
      </dt>
      <dd className="text-right tabular-nums">{children}</dd>
    </div>
  );
}

/** Exact difference of two decimal strings (a - b), no floats. */
export function difference(a: string, b: string): string {
  const scale = 8;
  const units = (v: string) => {
    const neg = v.startsWith("-");
    const [i, f = ""] = v.replace("-", "").split(".");
    const n = BigInt(i || "0") * 10n ** BigInt(scale) + BigInt((f + "0".repeat(scale)).slice(0, scale));
    return neg ? -n : n;
  };
  const d = units(a) - units(b);
  const neg = d < 0n;
  const abs = neg ? -d : d;
  const whole = abs / 10n ** BigInt(scale);
  const frac = (abs % 10n ** BigInt(scale)).toString().padStart(scale, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${frac ? "." + frac : ""}`;
}

/**
 * What was sent, charged and received. For an off-ramp: the USDC the customer sent, the naira they were due, any fees we recorded, the
 * naira that actually settled, and the gap when those differ. Fees we did not record are said so, not shown as zero.
 */
export function MoneyPanel({ money, amount, currency, payoutCurrency: payoutCurrencyProp, type }: { money: TraceMoney; amount: string | null; currency: string | null; payoutCurrency?: string | null; type: string }) {
  const offramp = type === "offramp" || type === "merchant_offramp";
  const payoutCurrency = offramp ? (payoutCurrencyProp ?? "NGN") : currency;
  const gap = money.expected !== null && money.settled !== null ? difference(money.settled, money.expected) : null;
  const unsettled = money.expected !== null && money.settled === null;
  return (
    <dl className="divide-y divide-(--c-line) rounded-(--c-radius) border border-(--c-line) px-3">
      {offramp && money.sent ? (
        <Row label="Customer sent">
          <Money value={money.sent.amount} currency={money.sent.currency} maxFraction={7} minFraction={2} />
        </Row>
      ) : !offramp && amount !== null ? (
        <Row label="Amount">
          <Money value={amount} currency={currency} maxFraction={6} minFraction={2} />
        </Row>
      ) : null}
      {money.expected !== null ? (
        <Row label={offramp ? "Customer due" : "Expected to settle"} hint={offramp ? "Payout currency, before any fees we recorded" : undefined}>
          <Money value={money.expected} currency={payoutCurrency} maxFraction={2} minFraction={2} />
        </Row>
      ) : null}
      {money.fees.map((f, i) => (
        <Row key={`${f.type}-${i}`} label={feeLabel(f.type)}>
          <Money value={f.amount} currency={f.currency} maxFraction={2} minFraction={2} />
        </Row>
      ))}
      {money.feeTotal ? (
        <Row label="Fees collected" hint="Deducted from the amount">
          <Money value={money.feeTotal.amount} currency={money.feeTotal.currency} maxFraction={8} minFraction={2} />
        </Row>
      ) : offramp ? (
        <Row label="Fees collected">
          <span className="text-(--c-muted)">None recorded</span>
        </Row>
      ) : null}
      {money.settled !== null || money.expected !== null ? (
        <Row label="Settled" hint={unsettled ? "Not settled yet" : undefined}>
          {money.settled !== null ? <Money value={money.settled} currency={payoutCurrency} maxFraction={2} minFraction={2} /> : "—"}
        </Row>
      ) : null}
      {gap !== null && gap !== "0" ? (
        <Row label={gap.startsWith("-") ? "Short by" : "Over by"}>
          <Money value={gap.replace("-", "")} currency={payoutCurrency} maxFraction={2} minFraction={2} />
        </Row>
      ) : null}
    </dl>
  );
}
