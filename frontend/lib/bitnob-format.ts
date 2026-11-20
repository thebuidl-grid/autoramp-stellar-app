/**
 * Helpers for showing Bitnob ledger records. Bitnob sends `amount_formatted` ready-made ("-5.000002 USDC", "+5.000253 USDC"):
 * it already carries a sign and the currency, so printing it next to the side and currency again gave "--5.000002 USDC USDC".
 */
import type { BitnobTransaction } from "@/lib/hooks/use-admin-bitnob";
import { traceUrl } from "@/lib/tracker";

export interface ParsedAmount {
  /** The unsigned magnitude as a plain decimal string, or null when the record has no usable amount. */
  value: string | null;
  currency: string | null;
  /** "in" = money arrived, "out" = money left, null = unknown. */
  direction: "in" | "out" | null;
}

const NUMBER = /(\d[\d,]*(?:\.\d+)?)/;

export function parseBitnobAmount(tx: Pick<BitnobTransaction, "amount_formatted" | "currency" | "side">): ParsedAmount {
  const raw = String(tx.amount_formatted ?? "").trim();
  const match = NUMBER.exec(raw);
  const value = match ? match[1].replace(/,/g, "") : null;

  // currency: what the record says, else the trailing code in the formatted text
  const trailing = /([A-Za-z]{2,10})\s*$/.exec(raw)?.[1]?.toUpperCase() ?? null;
  const currency = (tx.currency ? String(tx.currency).toUpperCase() : null) ?? trailing;

  const side = String(tx.side ?? "").toLowerCase();
  let direction: ParsedAmount["direction"] = side === "credit" ? "in" : side === "debit" ? "out" : null;
  if (!direction && /^[\s]*[-−]/.test(raw)) direction = "out";
  if (!direction && /^[\s]*\+/.test(raw)) direction = "in";

  return { value, currency, direction };
}

const TYPE_LABELS: Record<string, string> = {
  DEPOSIT_CONFIRMED: "Deposit",
  PAYOUT: "Payout",
  P2P_TRANSFER: "Transfer",
  WITHDRAWAL: "Withdrawal",
  TRADE: "Trade",
};

export function bitnobTypeLabel(type: string | null | undefined): string {
  const key = String(type ?? "").trim().toUpperCase();
  if (!key) return "Unknown";
  if (TYPE_LABELS[key]) return TYPE_LABELS[key];
  const words = key.toLowerCase().split("_").filter(Boolean).join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** References we generate ourselves. Bitnob's own (RCV_*, TRD_*, WDR_*, rate-*) are not ours, so there is nothing to open. */
const OURS = /^(off_|txn_ref_|otc_|BRG-)/;

export function isAutoRampReference(reference: string | null | undefined): boolean {
  return OURS.test(String(reference ?? "").trim());
}

/** Where to look at one of our transactions: its trace. */
export function autoRampTransactionHref(reference: string): string {
  return traceUrl(reference);
}

/** A next step for the errors people actually hit on this page. */
export function bitnobErrorHint(message: string | undefined, status?: number): string | undefined {
  if (status === 403 && /whitelist/i.test(message ?? "")) return "Add the backend's IP address to the allowlist on the Bitnob API key.";
  if (/not configured/i.test(message ?? "")) return "Set BITNOB_CLIENT_ID and BITNOB_KEY on the backend.";
  return undefined;
}
