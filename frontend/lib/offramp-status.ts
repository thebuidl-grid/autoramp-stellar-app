/**
 * Off-ramp status model for the UI (Deliverable 1).
 *
 * Mirrors the backend state machine (autoramp-backend/src/modules/ramp/offramp-state-machine.ts) and the
 * detail view the backend returns from GET /ramp/offramp/:reference (`view`). `viewFromLegacy` builds the same
 * view from the older transaction+history shape, so the UI also works against a backend that has not been
 * upgraded yet.
 */

export const OFFRAMP_STATUSES = [
  "INITIATED",
  "AWAITING_DEPOSIT",
  "DEPOSIT_DETECTED",
  "PROCESSING",
  "CONVERSION_PENDING",
  "PAYOUT_PENDING",
  "COMPLETED",
  "PARTIALLY_SETTLED",
  "FAILED",
  "REJECTED",
  "REVERSED",
  "EXPIRED",
  "INSUFFICIENT_LIQUIDITY",
] as const;

export type OfframpStatus = (typeof OFFRAMP_STATUSES)[number];

/** success = paid out; progress = still moving; warning = needs attention/held; error = did not pay out. */
export type StatusTone = "success" | "progress" | "warning" | "error";

export interface StatusMeta {
  label: string;
  tone: StatusTone;
  message: string;
}

export const STATUS_META: Record<OfframpStatus, StatusMeta> = {
  INITIATED: { label: "Initiated", tone: "progress", message: "Your cash-out was created." },
  AWAITING_DEPOSIT: {
    label: "Awaiting deposit",
    tone: "progress",
    message: "Send the exact USDC amount to the funding address before the window closes.",
  },
  DEPOSIT_DETECTED: { label: "Deposit detected", tone: "progress", message: "We detected your USDC deposit." },
  PROCESSING: { label: "Processing", tone: "progress", message: "Your deposit is being processed." },
  CONVERSION_PENDING: { label: "Converting", tone: "progress", message: "Your USDC is being converted to NGN." },
  PAYOUT_PENDING: {
    label: "Payout pending",
    tone: "progress",
    message: "Your NGN payout is being sent to your bank account.",
  },
  COMPLETED: { label: "Completed", tone: "success", message: "Your payout was completed." },
  PARTIALLY_SETTLED: {
    label: "Partially settled",
    tone: "warning",
    message:
      "Only part of the expected amount was received. The outstanding amount is shown below; contact support to complete or refund it.",
  },
  FAILED: {
    label: "Failed",
    tone: "error",
    message: "This cash-out failed. Your deposit information is preserved; contact support with your reference.",
  },
  REJECTED: {
    label: "Payout rejected",
    tone: "error",
    message:
      "The payout was rejected by the payout provider. This transaction was not paid out; contact support with your reference.",
  },
  REVERSED: {
    label: "Reversed",
    tone: "error",
    message: "This payout was reversed. See the reversal details; contact support if you need help.",
  },
  EXPIRED: {
    label: "Expired",
    tone: "error",
    message:
      "This cash-out timed out before it completed. If you already sent USDC, contact support with your reference and transaction hash.",
  },
  INSUFFICIENT_LIQUIDITY: {
    label: "Insufficient liquidity",
    tone: "warning",
    message:
      "There is not enough payout liquidity right now. Your transaction is on hold for review and can be retried; contact support with your reference.",
  },
};

/**
 * What the sell screen should say once the order moves past "waiting for the USDC".
 * null = keep the screen's own wording (INITIATED / AWAITING_DEPOSIT / unknown).
 * phase "done" = paid out, "failed" = did not pay out or needs attention (the screen stops spinning).
 */
export interface SellProgress {
  phase: "progress" | "done" | "failed";
  title: string;
  subtitle: string;
}

export function sellProgress(raw: string | null | undefined): SellProgress | null {
  const status = normalizeOfframpStatus(raw);
  switch (status) {
    case "DEPOSIT_DETECTED":
      return { phase: "progress", title: "We received your USDC", subtitle: "Your payout is being prepared now." };
    case "PROCESSING":
      return { phase: "progress", title: "Processing your payment", subtitle: "This usually takes a few minutes." };
    case "CONVERSION_PENDING":
      return { phase: "progress", title: "Converting your USDC", subtitle: "Your payout will be sent right after." };
    case "PAYOUT_PENDING":
      return { phase: "progress", title: "Sending your payout", subtitle: "Your money is on its way to your account." };
    case "COMPLETED":
      return { phase: "done", title: "Payout sent", subtitle: "Your money has been sent to your account." };
    case "PARTIALLY_SETTLED":
    case "FAILED":
    case "REJECTED":
    case "REVERSED":
    case "EXPIRED":
    case "INSUFFICIENT_LIQUIDITY":
      return { phase: "failed", title: STATUS_META[status].label, subtitle: STATUS_META[status].message };
    default:
      return null;
  }
}

/** Pre-existing TransactionStatus values mapped onto the new model (same mapping as the backend). */
const LEGACY: Record<string, OfframpStatus> = {
  PENDING: "AWAITING_DEPOSIT",
  PARTIAL: "PARTIALLY_SETTLED",
  CANCELLED: "FAILED",
  DISPUTED: "FAILED",
  REFUNDED: "REVERSED",
};

export function normalizeOfframpStatus(raw: string | null | undefined): OfframpStatus | null {
  if (!raw) return null;
  const s = raw.toUpperCase();
  if ((OFFRAMP_STATUSES as readonly string[]).includes(s)) return s as OfframpStatus;
  return LEGACY[s] ?? null;
}

/** Label/tone/message for any raw status string (unknown statuses degrade gracefully). */
export function statusMeta(raw: string | null | undefined): StatusMeta {
  const s = normalizeOfframpStatus(raw);
  if (s) return STATUS_META[s];
  const text = raw ? raw.charAt(0) + raw.slice(1).toLowerCase().replace(/_/g, " ") : "Unknown";
  return { label: text, tone: "progress", message: "Status unavailable." };
}

export const REASON_LABELS: Record<string, string> = {
  timeout: "Timed out",
  partial_settlement: "Partial settlement",
  rejected: "Payout rejected",
  reversal: "Payout reversed",
  insufficient_liquidity: "Insufficient liquidity",
  failed: "Failed",
};

export const reasonLabel = (reason: string | null | undefined) =>
  reason ? (REASON_LABELS[reason] ?? reason.replace(/_/g, " ")) : null;

// ---------------------------------------------------------------------------
// Exact decimals (USDC on Stellar has 7 dp)
// ---------------------------------------------------------------------------

const SCALE = 7;
const FACTOR = BigInt(10) ** BigInt(SCALE);

export function toUnits(value: string | number | null | undefined): bigint {
  if (value === null || value === undefined || value === "") return BigInt(0);
  const str = String(value).trim();
  if (!/^\d+(\.\d+)?$/.test(str)) return BigInt(0);
  const [whole, frac = ""] = str.split(".");
  return BigInt(whole) * FACTOR + BigInt(frac.padEnd(SCALE, "0").slice(0, SCALE));
}

export function fromUnits(units: bigint): string {
  const abs = units < BigInt(0) ? -units : units;
  const frac = (abs % FACTOR).toString().padStart(SCALE, "0");
  return `${units < BigInt(0) ? "-" : ""}${abs / FACTOR}.${frac}`;
}

export type SettlementKind = "NONE" | "PARTIAL" | "FULL" | "OVERPAID";

export interface Settlement {
  expected: string;
  received: string;
  outstanding: string;
  excess?: string;
  kind: SettlementKind;
}

export function computeSettlement(expected: unknown, received: unknown): Settlement {
  const e = toUnits(expected as string);
  const r = toUnits(received as string);
  return {
    expected: fromUnits(e),
    received: fromUnits(r),
    outstanding: fromUnits(e > r ? e - r : BigInt(0)),
    excess: fromUnits(r > e ? r - e : BigInt(0)),
    kind: r === BigInt(0) ? "NONE" : r < e ? "PARTIAL" : r === e ? "FULL" : "OVERPAID",
  };
}

// ---------------------------------------------------------------------------
// The detail view (shape of the backend's `view`)
// ---------------------------------------------------------------------------

export interface StatusHistoryEntry {
  from: string | null;
  to: string | null;
  at: string;
  reason: string | null;
  actor: string | null;
  /** True when this step was inferred because the provider skipped ahead. */
  inferred: boolean;
}

export interface AuditEntry {
  action: string;
  at: string;
  from: string | null;
  to: string | null;
  description: string | null;
}

export interface ReconciliationRecord {
  internalTransactionId: string;
  externalReference: string | null;
  reference: string;
  stellarTxHash: string | null;
  asset: string;
  amount: string;
  expectedSettlement: string;
  actualSettlement: string;
  outstandingAmount: string;
  status: string;
  failureReason: string | null;
  failureDetail: Record<string, unknown> | null;
  reconciliationResult: string;
  createdAt: string;
  updatedAt: string;
  settledAt: string | null;
}

export interface OfframpView {
  reference: string;
  internalId?: string;
  status: string;
  rawStatus?: string;
  statusLabel: string;
  statusMessage: string;
  successful: boolean;
  sourceAsset: string;
  depositAmount: string;
  expectedPayout: { amount: string | null; currency: string };
  actualPayout: { amount: string | null; currency: string };
  conversion: { rate: number; from: string; to: string } | null;
  settlement: Settlement;
  failureReason: string | null;
  failureDetail: Record<string, unknown> | null;
  stellarTxHash: string | null;
  reversal: {
    amount: string;
    reason: string | null;
    at: string;
    originalStatus: string;
    providerEventId?: string | null;
  } | null;
  timestamps: { createdAt: string; updatedAt: string; completedAt: string | null };
  statusHistory: StatusHistoryEntry[];
  auditLog: AuditEntry[];
  reconciliation: ReconciliationRecord | null;
}

/** Build the detail view from the older GET /ramp/offramp/:reference shape ({ transaction, history }). */
export function viewFromLegacy(
  transaction: any,
  history: Array<Record<string, any>> = [],
): OfframpView {
  const po = transaction?.providerOrder ?? null;
  const meta = statusMeta(transaction?.status);
  const normalized = normalizeOfframpStatus(transaction?.status);
  const settlement = computeSettlement(po?.expectedAmount, po?.receivedAmount);
  const fiat = transaction?.fiatAmount != null ? Number(transaction.fiatAmount) : null;
  const expectedUsdc = po?.expectedAmount != null ? Number(po.expectedAmount) : null;
  const currency = transaction?.currency ?? "NGN";

  return {
    reference: transaction?.reference,
    internalId: transaction?.id,
    status: normalized ?? transaction?.status,
    rawStatus: transaction?.status,
    statusLabel: meta.label,
    statusMessage: meta.message,
    successful: normalized === "COMPLETED",
    sourceAsset: "USDC",
    depositAmount: settlement.expected,
    expectedPayout: { amount: transaction?.fiatAmount?.toString() ?? null, currency },
    // Older backends don't return settledFiatAmount; a COMPLETED payout paid the quoted amount.
    actualPayout: {
      amount:
        transaction?.settledFiatAmount?.toString() ??
        (normalized === "COMPLETED" ? (transaction?.fiatAmount?.toString() ?? null) : null),
      currency,
    },
    conversion:
      fiat !== null && expectedUsdc
        ? { rate: Math.round((fiat / expectedUsdc) * 100) / 100, from: "USDC", to: currency }
        : null,
    settlement,
    failureReason: po?.failureReason ?? null,
    failureDetail: po?.failureDetail ?? null,
    stellarTxHash: po?.depositTxHash ?? null,
    reversal: null,
    timestamps: {
      createdAt: transaction?.createdAt,
      updatedAt: transaction?.updatedAt,
      completedAt: transaction?.completedAt ?? null,
    },
    statusHistory: history
      .filter((h) => h.newStatus && h.action !== "duplicate_event_ignored" && h.action !== "transition_rejected")
      .map((h) => ({
        from: h.oldStatus ?? null,
        to: h.newStatus ?? null,
        at: h.createdAt,
        reason: h.description ?? null,
        actor: h.metadata?.actor ?? null,
        inferred: !!h.metadata?.synthetic,
      })),
    auditLog: [],
    reconciliation: null,
  };
}
