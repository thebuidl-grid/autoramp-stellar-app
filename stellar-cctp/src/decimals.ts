/**
 * Decimal precision handling for Stellar USDC in CCTP.
 *
 * Stellar USDC: 7 decimal places (stroops × 10^7)
 * CCTP wire format: 6 decimal places (standardised across all chains)
 *
 * The difference means:
 *   burn  → truncate the 7th decimal before writing the CCTP message
 *   mint  → multiply the CCTP amount by 10 to get Stellar units
 */

const STELLAR_DECIMALS = 7;
const CCTP_DECIMALS = 6;
const SCALE_UP = 10n; // 10^(7-6)

/**
 * Converts a human-readable USDC amount string to Stellar stroops (bigint).
 * e.g. "10.5" → 105_000_000n
 */
export function toStellarStroops(amount: string): bigint {
  const [whole, frac = ""] = amount.split(".");
  const fracPadded = frac.slice(0, STELLAR_DECIMALS).padEnd(STELLAR_DECIMALS, "0");
  return BigInt(whole) * 10n ** BigInt(STELLAR_DECIMALS) + BigInt(fracPadded);
}

/**
 * Converts Stellar stroops (bigint) to a human-readable USDC string.
 * e.g. 105_000_000n → "10.5000000"
 */
export function fromStellarStroops(stroops: bigint): string {
  const divisor = 10n ** BigInt(STELLAR_DECIMALS);
  const whole = stroops / divisor;
  const frac = (stroops % divisor).toString().padStart(STELLAR_DECIMALS, "0");
  return `${whole}.${frac}`;
}

/**
 * Converts a human-readable USDC amount to the CCTP wire amount (6 decimals).
 * Truncates — never rounds — to match Circle's burn behaviour.
 * e.g. "0.1234567" → 123456n  (the 7th digit is dropped)
 */
export function toCctpAmount(amount: string): bigint {
  const [whole, frac = ""] = amount.split(".");
  const fracPadded = frac.slice(0, CCTP_DECIMALS).padEnd(CCTP_DECIMALS, "0");
  return BigInt(whole) * 10n ** BigInt(CCTP_DECIMALS) + BigInt(fracPadded);
}

/**
 * Converts a CCTP wire amount (6 decimals) to the Stellar stroops that will
 * actually be minted (×10 to scale from 6 → 7 decimals).
 */
export function cctpAmountToStellarStroops(cctpAmount: bigint): bigint {
  return cctpAmount * SCALE_UP;
}

/**
 * Converts a CCTP wire amount to a human-readable USDC string at 7 decimal precision.
 */
export function fromCctpAmount(cctpAmount: bigint): string {
  return fromStellarStroops(cctpAmountToStellarStroops(cctpAmount));
}

/**
 * How much USDC the burn will actually consume on Stellar given a desired amount.
 * The 7th decimal is always truncated.
 *
 * Example: user wants to send 0.1234567 USDC
 *   → actual burn: 0.1234560 USDC
 *   → CCTP message amount: 123456
 */
export function effectiveBurnAmount(amount: string): {
  burned: string;
  cctpAmount: bigint;
} {
  const cctpAmount = toCctpAmount(amount);
  return {
    burned: fromStellarStroops(cctpAmountToStellarStroops(cctpAmount)),
    cctpAmount,
  };
}
