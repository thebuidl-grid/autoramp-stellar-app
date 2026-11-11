/**
 * Off-ramp transaction state machine (Deliverable 1).
 *
 * Pure module — no database, framework or network access — so every rule is unit-testable.
 * The persistence layer (OfframpTransitionService) calls `assertTransition` before it writes.
 *
 *   INITIATED ─▶ AWAITING_DEPOSIT ─▶ DEPOSIT_DETECTED ─▶ PROCESSING ─▶ CONVERSION_PENDING ─▶ PAYOUT_PENDING ─▶ COMPLETED
 *                                                                                                  │  ├▶ REJECTED
 *                                                                                                  │  ├▶ INSUFFICIENT_LIQUIDITY ─▶ (retry) PAYOUT_PENDING
 *                                                                                                  │  └▶ PARTIALLY_SETTLED ─▶ COMPLETED (top-up)
 *   any active state ─▶ EXPIRED (timeout) | FAILED          COMPLETED / PARTIALLY_SETTLED ─▶ REVERSED
 */

export const OFFRAMP_STATES = [
  'INITIATED',
  'AWAITING_DEPOSIT',
  'DEPOSIT_DETECTED',
  'PROCESSING',
  'CONVERSION_PENDING',
  'PAYOUT_PENDING',
  'COMPLETED',
  'PARTIALLY_SETTLED',
  'FAILED',
  'REJECTED',
  'REVERSED',
  'EXPIRED',
  'INSUFFICIENT_LIQUIDITY',
] as const;

export type OfframpState = (typeof OFFRAMP_STATES)[number];

/** Allowed next states for each state. A state absent from a list can never be reached from it. */
export const TRANSITIONS: Readonly<Record<OfframpState, readonly OfframpState[]>> = {
  INITIATED: ['AWAITING_DEPOSIT', 'FAILED', 'EXPIRED'],
  AWAITING_DEPOSIT: ['DEPOSIT_DETECTED', 'FAILED', 'EXPIRED'],
  // An under-funded deposit settles partially straight away; otherwise processing starts.
  DEPOSIT_DETECTED: ['PROCESSING', 'PARTIALLY_SETTLED', 'FAILED', 'EXPIRED'],
  PROCESSING: ['CONVERSION_PENDING', 'PAYOUT_PENDING', 'FAILED', 'EXPIRED'],
  CONVERSION_PENDING: ['PAYOUT_PENDING', 'INSUFFICIENT_LIQUIDITY', 'FAILED', 'EXPIRED'],
  PAYOUT_PENDING: ['COMPLETED', 'PARTIALLY_SETTLED', 'REJECTED', 'INSUFFICIENT_LIQUIDITY', 'FAILED', 'EXPIRED'],
  COMPLETED: ['REVERSED'],
  // Outstanding amount may be topped up (-> COMPLETED), reversed, or abandoned.
  PARTIALLY_SETTLED: ['COMPLETED', 'REVERSED', 'FAILED', 'EXPIRED'],
  // Held for review/retry: liquidity may be replenished (retry payout), or the hold lapses.
  INSUFFICIENT_LIQUIDITY: ['PAYOUT_PENDING', 'FAILED', 'EXPIRED'],
  FAILED: [],
  REJECTED: [],
  REVERSED: [],
  EXPIRED: [],
};

/** States with no outgoing transitions. (COMPLETED can still be reversed, so it is not final.) */
export const FINAL_STATES: readonly OfframpState[] = OFFRAMP_STATES.filter((s) => TRANSITIONS[s].length === 0);

/** Pre-existing statuses (shared TransactionStatus enum / legacy rows) mapped onto the new model. */
const LEGACY: Readonly<Record<string, OfframpState>> = {
  PENDING: 'AWAITING_DEPOSIT',
  PARTIAL: 'PARTIALLY_SETTLED',
  CANCELLED: 'FAILED',
  DISPUTED: 'FAILED',
  REFUNDED: 'REVERSED',
};

export function isOfframpState(value: string): value is OfframpState {
  return (OFFRAMP_STATES as readonly string[]).includes(value);
}

/** Map any stored status onto the off-ramp state model (returns null for statuses it cannot represent). */
export function normalizeStatus(status: string | null | undefined): OfframpState | null {
  if (!status) return null;
  const s = status.toUpperCase();
  if (isOfframpState(s)) return s;
  return LEGACY[s] ?? null;
}

export function isFinalState(state: string): boolean {
  const s = normalizeStatus(state);
  return s !== null && TRANSITIONS[s].length === 0;
}

export function canTransition(from: string, to: string): boolean {
  const f = normalizeStatus(from);
  const t = normalizeStatus(to);
  if (!f || !t) return false;
  return TRANSITIONS[f].includes(t);
}

export class InvalidTransitionError extends Error {
  readonly code = 'INVALID_TRANSITION';
  constructor(
    readonly from: string,
    readonly to: string,
  ) {
    super(`Invalid off-ramp transition ${from} -> ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

export function assertTransition(from: string, to: string): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

/**
 * Shortest valid chain of transitions from `from` to `to` (excluding `from`, including `to`).
 * Provider events can skip steps (e.g. a bare "settled"); the persistence layer walks this path so every
 * intermediate state is recorded. Returns [] when already there and null when `to` is unreachable.
 */
/** Ordinary progress states: the only ones allowed as *inferred* intermediate steps. Exceptional outcomes
 *  (PARTIALLY_SETTLED, INSUFFICIENT_LIQUIDITY, REJECTED, ...) are only ever reached as an explicit target. */
const PROGRESS_STATES: readonly OfframpState[] = [
  'INITIATED',
  'AWAITING_DEPOSIT',
  'DEPOSIT_DETECTED',
  'PROCESSING',
  'CONVERSION_PENDING',
  'PAYOUT_PENDING',
];

export function shortestPath(from: string, to: string): OfframpState[] | null {
  const start = normalizeStatus(from);
  const goal = normalizeStatus(to);
  if (!start || !goal) return null;
  if (start === goal) return [];
  const prev = new Map<OfframpState, OfframpState>();
  const queue: OfframpState[] = [start];
  const seen = new Set<OfframpState>([start]);
  while (queue.length) {
    const cur = queue.shift()!;
    for (const next of TRANSITIONS[cur]) {
      if (seen.has(next)) continue;
      if (next !== goal && !PROGRESS_STATES.includes(next)) continue; // never infer an exceptional outcome
      seen.add(next);
      prev.set(next, cur);
      if (next === goal) {
        const path: OfframpState[] = [goal];
        for (let at = goal; prev.get(at) !== start; at = prev.get(at)!) path.unshift(prev.get(at)!);
        return path;
      }
      queue.push(next);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Timeouts (configurable through environment variables)
// ---------------------------------------------------------------------------

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

/** Env var + default per active state. Final states have no timeout. */
const TIMEOUT_CONFIG: Readonly<Partial<Record<OfframpState, { env: string; defaultMs: number }>>> = {
  INITIATED: { env: 'OFFRAMP_TIMEOUT_INITIATED_MS', defaultMs: 15 * MIN },
  AWAITING_DEPOSIT: { env: 'OFFRAMP_TIMEOUT_AWAITING_DEPOSIT_MS', defaultMs: 30 * MIN },
  DEPOSIT_DETECTED: { env: 'OFFRAMP_TIMEOUT_PROCESSING_MS', defaultMs: 15 * MIN },
  PROCESSING: { env: 'OFFRAMP_TIMEOUT_PROCESSING_MS', defaultMs: 15 * MIN },
  CONVERSION_PENDING: { env: 'OFFRAMP_TIMEOUT_PROCESSING_MS', defaultMs: 15 * MIN },
  PAYOUT_PENDING: { env: 'OFFRAMP_TIMEOUT_PAYOUT_PENDING_MS', defaultMs: HOUR },
  // Held for review / top-up: a longer window, then it lapses.
  PARTIALLY_SETTLED: { env: 'OFFRAMP_TIMEOUT_HELD_MS', defaultMs: 24 * HOUR },
  INSUFFICIENT_LIQUIDITY: { env: 'OFFRAMP_TIMEOUT_HELD_MS', defaultMs: 24 * HOUR },
};

/** Processing window for a state in ms, or undefined when the state never times out. */
export function timeoutMsFor(state: string, env: Record<string, string | undefined> = process.env): number | undefined {
  const s = normalizeStatus(state);
  const cfg = s ? TIMEOUT_CONFIG[s] : undefined;
  if (!cfg) return undefined;
  const fromEnv = Number(env[cfg.env]);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : cfg.defaultMs;
}

/** True when `since` is older than the state's timeout window at `now`. */
export function isTimedOut(
  state: string,
  since: Date,
  now: Date = new Date(),
  env: Record<string, string | undefined> = process.env,
): boolean {
  const ms = timeoutMsFor(state, env);
  return ms !== undefined && now.getTime() - since.getTime() >= ms;
}

// ---------------------------------------------------------------------------
// Exact decimal arithmetic (Stellar USDC has 7 decimal places)
// ---------------------------------------------------------------------------

const SCALE = 7;
const FACTOR = 10n ** BigInt(SCALE);

/** Parse a non-negative decimal (string/number/Decimal) into integer units of 1e-7. */
export function toUnits(value: string | number | { toString(): string } | null | undefined): bigint {
  if (value === null || value === undefined || value === '') return 0n;
  const str = value.toString().trim();
  if (!/^\d+(\.\d+)?$/.test(str)) throw new Error(`Invalid amount: ${str}`);
  const [whole, frac = ''] = str.split('.');
  return BigInt(whole) * FACTOR + BigInt(frac.padEnd(SCALE, '0').slice(0, SCALE));
}

/** Format integer units as a fixed 7-dp decimal string, e.g. 25000000n -> "2.5000000". */
export function fromUnits(units: bigint): string {
  const neg = units < 0n;
  const abs = neg ? -units : units;
  const whole = abs / FACTOR;
  const frac = (abs % FACTOR).toString().padStart(SCALE, '0');
  return `${neg ? '-' : ''}${whole}.${frac}`;
}

export type SettlementKind = 'NONE' | 'PARTIAL' | 'FULL' | 'OVERPAID';

export interface SettlementResult {
  expected: string;
  received: string;
  /** expected - received when under-funded, else 0. */
  outstanding: string;
  /** received - expected when over-funded, else 0. */
  excess: string;
  kind: SettlementKind;
}

/** Compare the expected and actual settlement amounts. */
export function computeSettlement(expected: unknown, received: unknown): SettlementResult {
  const e = toUnits(expected as string);
  const r = toUnits(received as string);
  const outstanding = e > r ? e - r : 0n;
  const excess = r > e ? r - e : 0n;
  const kind: SettlementKind = r === 0n ? 'NONE' : r < e ? 'PARTIAL' : r === e ? 'FULL' : 'OVERPAID';
  return {
    expected: fromUnits(e),
    received: fromUnits(r),
    outstanding: fromUnits(outstanding),
    excess: fromUnits(excess),
    kind,
  };
}

// ---------------------------------------------------------------------------
// Simulated liquidity
// ---------------------------------------------------------------------------

export interface LiquidityCheck {
  ok: boolean;
  required: string;
  available: string;
  /** required - available when short, else 0. */
  shortfall: string;
}

export function checkLiquidity(required: unknown, available: unknown): LiquidityCheck {
  const req = toUnits(required as string);
  const avail = toUnits(available as string);
  return {
    ok: avail >= req,
    required: fromUnits(req),
    available: fromUnits(avail),
    shortfall: fromUnits(req > avail ? req - avail : 0n),
  };
}

// ---------------------------------------------------------------------------
// Reconciliation + user-facing messages
// ---------------------------------------------------------------------------

export type ReconciliationResult =
  | 'IN_PROGRESS'
  | 'MATCHED'
  | 'UNDERPAID'
  | 'OVERPAID'
  | 'PAYOUT_REJECTED'
  | 'FUNDS_REVERSED'
  | 'LIQUIDITY_SHORTFALL'
  | 'TIMED_OUT'
  | 'FAILED';

/** Classify where a transaction stands against what was expected. */
export function reconciliationResult(state: string, settlement: SettlementResult): ReconciliationResult {
  const s = normalizeStatus(state);
  switch (s) {
    case 'COMPLETED':
      return settlement.kind === 'OVERPAID' ? 'OVERPAID' : 'MATCHED';
    case 'PARTIALLY_SETTLED':
      return 'UNDERPAID';
    case 'REJECTED':
      return 'PAYOUT_REJECTED';
    case 'REVERSED':
      return 'FUNDS_REVERSED';
    case 'INSUFFICIENT_LIQUIDITY':
      return 'LIQUIDITY_SHORTFALL';
    case 'EXPIRED':
      return 'TIMED_OUT';
    case 'FAILED':
      return 'FAILED';
    default:
      return 'IN_PROGRESS';
  }
}

export interface StateDescription {
  label: string;
  /** Guidance shown to the user, including a support/recovery hint for non-success outcomes. */
  message: string;
  /** Whether the outcome must never be presented as a successful cash-out. */
  successful: boolean;
}

export function describeState(state: string): StateDescription {
  const s = normalizeStatus(state);
  switch (s) {
    case 'INITIATED':
      return { label: 'Initiated', message: 'Your cash-out was created.', successful: false };
    case 'AWAITING_DEPOSIT':
      return { label: 'Awaiting deposit', message: 'Send the exact USDC amount to the funding address before the window closes.', successful: false };
    case 'DEPOSIT_DETECTED':
      return { label: 'Deposit detected', message: 'We detected your USDC deposit.', successful: false };
    case 'PROCESSING':
      return { label: 'Processing', message: 'Your deposit is being processed.', successful: false };
    case 'CONVERSION_PENDING':
      return { label: 'Converting', message: 'Your USDC is being converted to NGN.', successful: false };
    case 'PAYOUT_PENDING':
      return { label: 'Payout pending', message: 'Your NGN payout is being sent to your bank account.', successful: false };
    case 'COMPLETED':
      return { label: 'Completed', message: 'Your payout was completed.', successful: true };
    case 'PARTIALLY_SETTLED':
      return { label: 'Partially settled', message: 'Only part of the expected amount was received. The outstanding amount is shown below; contact support to complete or refund it.', successful: false };
    case 'FAILED':
      return { label: 'Failed', message: 'This cash-out failed. Your deposit information is preserved; contact support with your reference.', successful: false };
    case 'REJECTED':
      return { label: 'Payout rejected', message: 'The payout was rejected by the payout provider. This transaction was not paid out; contact support with your reference.', successful: false };
    case 'REVERSED':
      return { label: 'Reversed', message: 'This payout was reversed. See the reversal details; contact support if you need help.', successful: false };
    case 'EXPIRED':
      return { label: 'Expired', message: 'This cash-out timed out before it completed. If you already sent USDC, contact support with your reference and transaction hash.', successful: false };
    case 'INSUFFICIENT_LIQUIDITY':
      return { label: 'Insufficient liquidity', message: 'There is not enough payout liquidity right now. Your transaction is on hold for review and can be retried; contact support with your reference.', successful: false };
    default:
      return { label: status_fallback(state), message: 'Status unavailable.', successful: false };
  }
}

function status_fallback(state: string): string {
  return state ? state.charAt(0) + state.slice(1).toLowerCase() : 'Unknown';
}
