import type { TrackKind } from "@/components/ui-shared";

/** Plain names for the transaction types the admin list returns. */
const TYPE_LABELS: Record<string, string> = {
  onramp: "On-ramp",
  offramp: "Off-ramp",
  swap: "Swap",
  otc: "OTC",
  bank_transfer: "Bank transfer",
  vas: "VAS",
  merchant_onramp: "Merchant on-ramp",
  merchant_offramp: "Merchant off-ramp",
  merchant_swap: "Merchant swap",
};

export function transactionTypeLabel(type: string | null | undefined): string {
  const key = String(type ?? "").trim().toLowerCase();
  if (!key) return "Unknown";
  if (TYPE_LABELS[key]) return TYPE_LABELS[key];
  const words = key.split("_").filter(Boolean).join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Which step line to draw for a type (merchant variants follow their user-side type). */
export function trackKindFor(type: string | null | undefined): TrackKind | null {
  const key = String(type ?? "").trim().toLowerCase().replace(/^merchant_/, "");
  switch (key) {
    case "onramp":
      return "ONRAMP";
    case "offramp":
      return "OFFRAMP";
    case "swap":
      return "SWAP";
    case "otc":
      return "OTC";
    case "vas":
      return "VAS";
    default:
      return null; // bank transfers have no step line
  }
}

/**
 * Types whose `amount` is Nigerian naira. A user off-ramp stores the naira the customer asked to receive (the USDC they send is on its
 * payout leg); swaps and merchant off-ramps store token amounts, so they get no naira sign.
 */
const NAIRA_TYPES = new Set(["onramp", "merchant_onramp", "offramp", "otc", "bank_transfer", "vas"]);

/**
 * The currency to show next to a list amount. Prefer the currency supplied by the API; use NGN only for known naira-denominated types.
 */
export function amountCurrency(tx: { type?: string | null; currency?: string | null }): string | null {
  if (tx.currency) return String(tx.currency).toUpperCase();
  return NAIRA_TYPES.has(String(tx.type ?? "").toLowerCase()) ? "NGN" : null;
}

/** Statuses the filter offers; anything else in a URL is ignored rather than producing an empty list. */
export const FILTER_STATUSES = ["COMPLETED", "PENDING", "PROCESSING", "FAILED", "CANCELLED"];

export const TYPE_TABS = ["all", "onramp", "offramp", "swap", "otc", "bank_transfer", "vas", "merchant"] as const;
export type TypeTab = (typeof TYPE_TABS)[number];
export const TRANSFER_LOGS_TAB = "transfer-logs";
export const STUCK_TAB = "stuck";
export const FAILED_TAB = "failed";

export function isKnownTab(value: string | null | undefined): value is TypeTab | typeof TRANSFER_LOGS_TAB | typeof STUCK_TAB | typeof FAILED_TAB {
  return !!value && ((TYPE_TABS as readonly string[]).includes(value) || value === TRANSFER_LOGS_TAB || value === STUCK_TAB || value === FAILED_TAB);
}
