/**
 * The off-ramp order API (POST /ramp/offramp) takes `amount` as a NAIRA amount (min ₦2,000), not a token amount.
 * The sell form collects USDC, so the naira amount is USDC x the current USD/NGN rate.
 */
export const MIN_OFFRAMP_NGN = 2000;

export type NgnAmountResult =
  | { ok: true; ngn: number }
  | { ok: false; reason: "invalid" | "below_minimum"; minUsdc?: number };

export function ngnAmountForUsdc(usdc: number, rate: number): NgnAmountResult {
  if (!Number.isFinite(usdc) || usdc <= 0 || !Number.isFinite(rate) || rate <= 0) {
    return { ok: false, reason: "invalid" };
  }
  const ngn = Math.round(usdc * rate * 100) / 100;
  if (ngn < MIN_OFFRAMP_NGN) {
    return { ok: false, reason: "below_minimum", minUsdc: Math.ceil((MIN_OFFRAMP_NGN / rate) * 100) / 100 };
  }
  return { ok: true, ngn };
}
