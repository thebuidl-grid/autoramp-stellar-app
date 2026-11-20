/** Types for the admin transaction tracker (mirror the backend's /admin/transactions/:reference/trace and friends). */

export type TimelineKind = "created" | "leg" | "log" | "webhook";

export interface TimelineEntry {
  at: string;
  kind: TimelineKind;
  title: string;
  provider?: string | null;
  step?: string | null;
  outcome?: string | null;
  from?: string | null;
  to?: string | null;
  description?: string | null;
  legId?: string | null;
  detail?: unknown;
  webhookEventId?: string;
  processed?: boolean;
  error?: string | null;
}

export interface TraceLeg {
  id: string;
  role: string;
  provider: string;
  providerReference: string | null;
  status: string | null;
  expectedAmount: string | null;
  receivedAmount: string | null;
  outstandingAmount: string | null;
  fundingAddress: string | null;
  depositTxHash: string | null;
  failedStep: string | null;
  failureReason: string | null;
  lastEventAt: string | null;
  createdAt: string;
}

export interface TraceTransaction {
  id: string;
  type: string;
  scope: "USER" | "MERCHANT";
  reference: string;
  status: string;
  amount: string | null;
  currency: string | null;
  payoutCurrency?: string | null;
  ownerId: string | null;
  /** The network the website was on when this was created; null when it was not recorded. */
  chainNetwork?: "mainnet" | "testnet" | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface TraceMoney {
  fees: Array<{ type: string; amount: string; currency: string }>;
  feeTotal: { amount: string; currency: string | null } | null;
  expected: string | null;
  /** What the customer sends, in the token they sent (off-ramps). Absent on an older backend. */
  sent?: { amount: string; currency: string } | null;
  settled: string | null;
}

export interface TraceVirtualAccount {
  accountNumber: string;
  accountName: string | null;
  bankName: string | null;
  bankCode: string | null;
  status: string | null;
  expectedAmount: string | null;
  expiresAt: string | null;
  reference: string | null;
  externalReference: string | null;
  createdAt: string | null;
  /** Off-ramps: the naira Safehaven credited to the account and our reference for forwarding it to the customer's bank. */
  credited?: string | null;
  forwardReference?: string | null;
  activity: Array<{ id: string; eventType: string | null; status: string | null; processed: boolean; transactionId: string | null; errorMessage: string | null; createdAt: string }>;
}

export interface TraceHalf {
  /** The Safehaven virtual account collecting this NGN transaction's payment. Optional so an older backend still renders. */
  virtualAccount?: TraceVirtualAccount | null;
  /** Optional so an older backend that does not send it still renders. */
  money?: TraceMoney;
  transaction: TraceTransaction;
  relatedId: string | null;
  hasParentRow: boolean;
  legs: TraceLeg[];
  timeline: TimelineEntry[];
  failedAt: { step: string; provider: string | null; reason: string | null } | null;
}

export interface TraceResult {
  reference: string;
  transactions: TraceHalf[];
  unlinkedWebhooks: Array<{ id: string; provider: string | null; eventType: string | null; status: string | null; at: string; transactionId: string }>;
}

export interface HealthRow {
  id: string;
  reference: string;
  type: string;
  status: string;
  amount: string | null;
  currency: string | null;
  ownerId: string | null;
  createdAt: string;
  updatedAt: string;
  ageMinutes: number;
  lastStep: string | null;
  providers: Array<{ provider: string; role: string; status: string | null; failedStep: string | null; failureReason: string | null }>;
}

export interface HealthPage {
  total: number;
  limit: number;
  offset: number;
  items: HealthRow[];
}

export interface AttentionCounts {
  failed: number;
  stuck: number;
  unmatchedWebhooks: number;
}

export interface WebhookRow {
  id: string;
  provider: string | null;
  eventType: string | null;
  status: string | null;
  reference: string;
  transactionType: string;
  transactionId: string;
  processed: boolean;
  errorMessage: string | null;
  legId: string | null;
  inboundWebhookId: string | null;
  createdAt: string;
  matched: boolean;
}

export interface WebhookPage {
  total: number;
  limit: number;
  offset: number;
  items: WebhookRow[];
}

export interface WebhookDetail extends Omit<WebhookRow, "inboundWebhookId"> {
  processedAt: string | null;
  payload: unknown;
  inbound: { id: string; endpoint: string; status: string; error: string | null; receivedAt: string; payload: unknown } | null;
}

/** Link to the trace page for a reference. Encoded, because references can hold characters that are not path-safe. */
export function traceUrl(reference: string): string {
  return `/admin/transactions/${encodeURIComponent(reference.trim())}`;
}

/**
 * How a provider leg should look on the ribbon.
 * - failed: it recorded a failed step, or its own status says it failed
 * - live: still being worked on
 * - ok: finished well
 * - idle: nothing has happened on it yet
 */
export type LegTone = "ok" | "live" | "danger" | "idle";

export function legTone(leg: Pick<TraceLeg, "status" | "failedStep" | "lastEventAt">, transactionStatus?: string | null): LegTone {
  if (leg.failedStep) return "danger";
  const s = String(leg.status ?? "").toUpperCase().replace(/[.\s-]+/g, "_");
  const last = s.split("_").pop() ?? "";
  if (["FAILED", "REJECTED", "ERROR"].includes(last) || ["FAILED", "REJECTED"].includes(s)) return "danger";
  if (["SETTLED", "SUCCESS", "COMPLETED", "CONFIRMED", "DELIVERED"].includes(last) || ["COMPLETED", "SUCCESS"].includes(s)) return "ok";
  if (!s && !leg.lastEventAt) return "idle";
  // a leg that never reported a final status inherits the transaction's end state
  const tx = String(transactionStatus ?? "").toUpperCase();
  if (!s && tx === "COMPLETED") return "ok";
  return "live";
}

const ROLE_ORDER: Record<string, number> = { FUNDING: 0, BRIDGE: 1, CONVERSION: 2, PAYOUT: 3, SETTLEMENT: 4 };

/** Legs in the order money moves: funding, bridge, conversion, payout, settlement; ties by when they started. */
export function orderLegs<T extends Pick<TraceLeg, "role" | "createdAt">>(legs: T[]): T[] {
  return [...legs].sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9) || a.createdAt.localeCompare(b.createdAt));
}

/** The last status the transaction reached before it stopped, read from the timeline (for StatusTrack's reachedStatus). */
export function lastReachedStatus(timeline: TimelineEntry[], currentStatus: string): string | null {
  const stopped = new Set(["FAILED", "REJECTED", "EXPIRED", "REVERSED", "CANCELLED", "INSUFFICIENT_LIQUIDITY", "PARTIALLY_SETTLED"]);
  if (!stopped.has(String(currentStatus).toUpperCase())) return null;
  for (let i = timeline.length - 1; i >= 0; i--) {
    const to = String(timeline[i].to ?? "").toUpperCase();
    const from = String(timeline[i].from ?? "").toUpperCase();
    if (stopped.has(to) && from && !stopped.has(from)) return from;
    if (to && !stopped.has(to) && timeline[i].kind === "log") return to;
  }
  return null;
}

/** "2h 5m", "45m", "3d 4h". */
export function formatAge(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d}d ${h % 24}h` : `${d}d`;
}

/** "+45s", "+3m 20s", "+2h 5m": the gap since the previous step, so slow steps stand out. */
export function formatGap(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) return `+${total}s`;
  const m = Math.floor(total / 60);
  if (m < 60) return total % 60 ? `+${m}m ${total % 60}s` : `+${m}m`;
  return `+${formatAge(m)}`;
}

export interface AdminLink {
  label: string;
  href: string;
}

/**
 * Where else in this admin to look at a transaction: the same payout on the Bitnob page, the virtual account or Safehaven money on the
 * Safehaven page, the CCTP transfer on the CCTP page. Built from what the trace already holds, so no provider URLs or settings are needed.
 */
export function adminLinks(half: Pick<TraceHalf, "transaction" | "legs" | "virtualAccount">): AdminLink[] {
  const out: AdminLink[] = [];
  const ref = half.transaction.reference;
  const has = (provider: string) => half.legs.some((l) => l.provider.toUpperCase() === provider);
  if (has("BITNOB")) out.push({ label: "See on the Bitnob page", href: `/admin/bitnob?reference=${encodeURIComponent(ref)}` });
  if (half.virtualAccount) out.push({ label: "See the virtual account on the Safehaven page", href: `/admin/safehaven?q=${encodeURIComponent(half.virtualAccount.accountNumber)}` });
  else if (has("SAFEHAVEN")) {
    const leg = half.legs.find((l) => l.provider.toUpperCase() === "SAFEHAVEN" && l.providerReference);
    out.push({ label: "See on the Safehaven page", href: `/admin/safehaven?tab=transactions&q=${encodeURIComponent(leg?.providerReference ?? ref)}` });
  }
  if (has("CCTP") || half.transaction.type === "bridge") out.push({ label: "See on the CCTP page", href: `/admin/cctp?q=${encodeURIComponent(ref)}` });
  return out;
}
