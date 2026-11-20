/**
 * The detail tables a transaction can live in. They are the source of truth for status and amounts (the parent `transactions` rows
 * are only kept current for history so far), so the tracker reads these and uses the parents for extra links.
 */
export type TrackerScope = 'USER' | 'MERCHANT';

export interface TrackerSource {
  /** The type name shown to admins and used by the list endpoints. */
  type: string;
  /** Prisma delegate name on PrismaService. */
  model: string;
  /** SQL table, for the raw webhook match query. */
  table: string;
  scope: TrackerScope;
  /** Column that names who owns it. */
  owner: 'userId' | 'merchantId';
  amount: (row: any) => string | null;
  currency: (row: any) => string | null;
}

const str = (v: unknown): string | null =>
  v === null || v === undefined ? null : String(v);

export const TRACKER_SOURCES: TrackerSource[] = [
  {
    type: 'onramp',
    model: 'onrampTransaction',
    table: 'onramp_transactions',
    scope: 'USER',
    owner: 'userId',
    amount: (r) => str(r.amount),
    currency: (r) => str(r.currency),
  },
  {
    type: 'offramp',
    model: 'offrampTransaction',
    table: 'offramp_transactions',
    scope: 'USER',
    owner: 'userId',
    // A user off-ramp's `amount` is the payout fiat the customer asked to receive (the USDC they send is on the payout leg), in the
    // row's own currency (NGN, KES, ...).
    amount: (r) => str(r.fiatAmount ?? r.amount),
    currency: (r) => str(r.currency) ?? 'NGN',
  },
  {
    type: 'swap',
    model: 'swapTransaction',
    table: 'swap_transactions',
    scope: 'USER',
    owner: 'userId',
    amount: (r) => str(r.fromAmount),
    currency: (r) => str(r.fromTokenType),
  },
  {
    type: 'otc',
    model: 'otcTransaction',
    table: 'otc_transactions',
    scope: 'USER',
    owner: 'userId',
    amount: (r) => str(r.amount),
    currency: () => null,
  },
  {
    type: 'bridge',
    model: 'bridgeTransaction',
    table: 'bridge_transactions',
    scope: 'USER',
    owner: 'userId',
    amount: (r) => str(r.amount),
    currency: () => null,
  },
  {
    type: 'merchant_onramp',
    model: 'merchantOnrampTransaction',
    table: 'merchant_onramp_transactions',
    scope: 'MERCHANT',
    owner: 'merchantId',
    amount: (r) => str(r.amount),
    currency: (r) => str(r.currency),
  },
  {
    type: 'merchant_offramp',
    model: 'merchantOfframpTransaction',
    table: 'merchant_offramp_transactions',
    scope: 'MERCHANT',
    owner: 'merchantId',
    amount: (r) => str(r.amount),
    currency: (r) => str(r.tokenType ?? r.currency),
  },
  {
    type: 'merchant_swap',
    model: 'merchantSwapTransaction',
    table: 'merchant_swap_transactions',
    scope: 'MERCHANT',
    owner: 'merchantId',
    amount: (r) => str(r.fromAmount),
    currency: (r) => str(r.fromTokenType),
  },
  {
    type: 'vas',
    model: 'vasTransaction',
    table: 'vas_transactions',
    scope: 'MERCHANT',
    owner: 'merchantId',
    amount: (r) => str(r.amount),
    currency: (r) => str(r.currency),
  },
];

/** Statuses that count as failed. */
export const FAILED_STATUSES = [
  'FAILED',
  'REJECTED',
  'REVERSED',
  'EXPIRED',
] as const;

/** Statuses that are not finished yet: a transaction in one of them for too long is "stuck". */
export const OPEN_STATUSES = [
  'PENDING',
  'INITIATED',
  'AWAITING_DEPOSIT',
  'DEPOSIT_DETECTED',
  'CONVERSION_PENDING',
  'PROCESSING',
  'PAYOUT_PENDING',
  'PARTIALLY_SETTLED',
  'INSUFFICIENT_LIQUIDITY',
] as const;

const DEFAULT_STUCK_MINUTES: Record<string, number> = {
  PENDING: 60,
  INITIATED: 30,
  // the user has to send funds: allow a long window (the funding window itself expires the order)
  AWAITING_DEPOSIT: 360,
  DEPOSIT_DETECTED: 30,
  CONVERSION_PENDING: 30,
  PROCESSING: 30,
  PAYOUT_PENDING: 30,
  PARTIALLY_SETTLED: 60,
  INSUFFICIENT_LIQUIDITY: 60,
};

/**
 * How long a transaction may sit in a status before it counts as stuck. Override one status with STUCK_AFTER_<STATUS>_MINUTES
 * (e.g. STUCK_AFTER_PAYOUT_PENDING_MINUTES=15) or all of them with STUCK_AFTER_MINUTES.
 */
export function stuckThresholdMinutes(
  status: string,
  env: Record<string, string | undefined> = process.env,
): number {
  const num = (v: string | undefined) =>
    v !== undefined &&
    v.trim() !== '' &&
    Number.isFinite(Number(v)) &&
    Number(v) > 0
      ? Number(v)
      : undefined;
  return (
    num(env[`STUCK_AFTER_${status}_MINUTES`]) ??
    num(env.STUCK_AFTER_MINUTES) ??
    DEFAULT_STUCK_MINUTES[status] ??
    60
  );
}

/**
 * Anything unchanged for longer than this is abandoned, not "stuck": an old PENDING order nobody finished does not need an admin
 * today, and counting it would bury the ones that do. Override with STUCK_MAX_AGE_DAYS; the stuck list can include them on request.
 */
export function stuckMaxAgeDays(
  env: Record<string, string | undefined> = process.env,
): number {
  const v = env.STUCK_MAX_AGE_DAYS;
  return v !== undefined &&
    v.trim() !== '' &&
    Number.isFinite(Number(v)) &&
    Number(v) > 0
    ? Number(v)
    : 14;
}
