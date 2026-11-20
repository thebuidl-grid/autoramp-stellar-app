/**
 * The one place that decides how a transaction/provider status looks, for admin and merchant alike.
 * Colour is a state signal only: ok / warn / danger / neutral, plus "live" (in progress, signal teal).
 */
export type StatusTone = "ok" | "warn" | "danger" | "neutral" | "live";

const TONES: Record<string, StatusTone> = {
  // finished well
  COMPLETED: "ok",
  SUCCESS: "ok",
  SETTLED: "ok",
  VERIFIED: "ok",
  ACTIVE: "ok",
  // in progress (we are doing something)
  PROCESSING: "live",
  DEPOSIT_DETECTED: "live",
  CONVERSION_PENDING: "live",
  PAYOUT_PENDING: "live",
  // waiting on someone else
  PENDING: "neutral",
  INITIATED: "neutral",
  AWAITING_DEPOSIT: "neutral",
  CANCELLED: "neutral",
  // needs a human to look
  PARTIAL: "warn",
  PARTIALLY_SETTLED: "warn",
  INSUFFICIENT_LIQUIDITY: "warn",
  EXPIRED: "warn",
  DISPUTED: "warn",
  REVERSED: "warn",
  REFUNDED: "warn",
  DELAYED: "warn",
  STUCK: "warn",
  // failed
  FAILED: "danger",
  REJECTED: "danger",
  UNDERPAYMENT: "danger",
  // accounts: an admin chose to block this one
  SUSPENDED: "warn",
};

const LABELS: Record<string, string> = {
  AWAITING_DEPOSIT: "Awaiting deposit",
  DEPOSIT_DETECTED: "Deposit detected",
  CONVERSION_PENDING: "Converting",
  PAYOUT_PENDING: "Paying out",
  PARTIALLY_SETTLED: "Partly settled",
  INSUFFICIENT_LIQUIDITY: "Insufficient liquidity",
};

/** "payout.settled" -> "PAYOUT_SETTLED"; provider event names and mixed-case statuses share one key space. */
export function normalizeStatusKey(status: string | null | undefined): string {
  return String(status ?? "")
    .trim()
    .replace(/[.\s-]+/g, "_")
    .toUpperCase();
}

export function statusTone(status: string | null | undefined): StatusTone {
  const key = normalizeStatusKey(status);
  if (TONES[key]) return TONES[key];
  // provider events: payout.settled / payout.failed / deposit.pending ...
  const last = key.split("_").pop() ?? "";
  if (["SETTLED", "SUCCESS", "COMPLETED", "CONFIRMED"].includes(last)) return "ok";
  if (["FAILED", "REJECTED", "ERROR"].includes(last)) return "danger";
  if (["EXPIRED", "REVERSED", "PARTIAL"].includes(last)) return "warn";
  return "neutral";
}

export function statusLabel(status: string | null | undefined): string {
  const key = normalizeStatusKey(status);
  if (!key) return "Unknown";
  if (LABELS[key]) return LABELS[key];
  const words = key.toLowerCase().split("_").filter(Boolean).join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Statuses that will not change any more (used by trackers to tell "stuck" from "done"). */
export function isTerminalStatus(status: string | null | undefined): boolean {
  const tone = statusTone(status);
  return tone === "ok" || tone === "danger" || ["CANCELLED", "EXPIRED", "REVERSED", "REFUNDED"].includes(normalizeStatusKey(status));
}
