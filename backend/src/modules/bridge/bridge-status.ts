/**
 * User-facing transactions (bridge, on-ramp, off-ramp, swap) expose exactly three states: PENDING, COMPLETED, FAILED.
 * Provider/bookkeeping states (PROCESSING, WAITING, DELAYED, STUCK, SUCCESS,
 * REJECTED, REVERSED, ...) are folded into these on the way in and out.
 */
export type BridgeStatus = 'PENDING' | 'COMPLETED' | 'FAILED';

export function normalizeBridgeStatus(status: string | null | undefined): BridgeStatus {
  switch ((status ?? '').toUpperCase()) {
    case 'COMPLETED':
    case 'SUCCESS':
      return 'COMPLETED';
    case 'FAILED':
    case 'REJECTED':
    case 'REVERSED':
    case 'EXPIRED':
    case 'CANCELLED':
    case 'REFUNDED':
      return 'FAILED';
    default:
      return 'PENDING';
  }
}
