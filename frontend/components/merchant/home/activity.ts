import type { UnifiedTransaction } from "@/lib/api";

const LABEL: Record<UnifiedTransaction["type"], string> = {
  onramp: "Customer payment",
  offramp: "Payout to bank",
  swap: "Currency swap",
  bank_transfer: "Bank transfer",
};

/** Plain name for a row. */
export const activityLabel = (type: string): string => LABEL[type as UnifiedTransaction["type"]] ?? "Transaction";

/** The second line: who or where it went, from whatever detail the provider gave. Empty when there is nothing useful. */
export function activityDetail(tx: Pick<UnifiedTransaction, "type" | "details">): string {
  const d = tx.details ?? {};
  switch (tx.type) {
    case "swap":
      return d.fromTokenType && d.toTokenType ? `${d.fromTokenType} to ${d.toTokenType}` : "";
    case "offramp":
      return [d.bankName ?? d.bankCode, d.accountNumber].filter(Boolean).join(" · ");
    case "bank_transfer":
      return String(d.narration ?? d.beneficiaryName ?? "");
    default:
      return String(d.network ?? "");
  }
}

/** The currency a row's amount is in: swaps and off-ramps move tokens, payments and transfers are naira. */
export function activityCurrency(tx: Pick<UnifiedTransaction, "type" | "details">): string {
  if (tx.type === "swap") return String(tx.details?.fromTokenType ?? "USDC");
  if (tx.type === "offramp") return String(tx.details?.tokenType ?? "USDC");
  return "NGN";
}

export interface ActivityFee {
  type: string;
  amount: string;
  currency: string;
}

const FEE_NAME: Record<string, string> = { provider_fee: "Provider fee", vat: "VAT", stamp_duty: "Stamp duty", platform_fee: "Our fee" };
export const feeName = (type: string): string => FEE_NAME[type] ?? type.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

const SCALE = 8;
function toUnits(v: string | number): bigint {
  const str = String(v);
  const neg = str.startsWith("-");
  const [i, f = ""] = str.replace("-", "").split(".");
  const n = BigInt(i || "0") * 10n ** BigInt(SCALE) + BigInt((f + "0".repeat(SCALE)).slice(0, SCALE));
  return neg ? -n : n;
}
function fromUnits(n: bigint): string {
  const neg = n < 0n;
  const abs = neg ? -n : n;
  const whole = abs / 10n ** BigInt(SCALE);
  const frac = (abs % 10n ** BigInt(SCALE)).toString().padStart(SCALE, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${frac ? "." + frac : ""}`;
}

/** Total of the fees, and what is left after them, when every fee is in the transaction's own currency. Null otherwise (no guessing). */
export function feeBreakdown(amount: number | string, currency: string, fees: ActivityFee[] | undefined): { total: string; net: string } | null {
  if (!fees || fees.length === 0) return null;
  if (fees.some((f) => f.currency !== currency)) return null;
  const total = fees.reduce((sum, f) => sum + toUnits(f.amount), 0n);
  return { total: fromUnits(total), net: fromUnits(toUnits(amount) - total) };
}

/** The identifiers worth copying when you contact support or reconcile: our reference, the provider's, and the chain hash for swaps. */
export function activityIds(tx: Pick<UnifiedTransaction, "reference" | "details">): Array<{ label: string; value: string }> {
  const d = tx.details ?? {};
  const out: Array<{ label: string; value: string }> = [];
  if (tx.reference) out.push({ label: "Reference", value: tx.reference });
  if (d.providerReference) out.push({ label: "Provider reference", value: String(d.providerReference) });
  if (d.transactionHash) out.push({ label: "Transaction hash", value: String(d.transactionHash) });
  return out;
}
