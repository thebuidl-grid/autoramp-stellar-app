/**
 * The off-ramp order API (POST /ramp/offramp) takes `amount` as a local-currency amount, not a token amount.
 * The sell form collects USDC, so the amount is USDC x the current rate. There is no minimum cash-out.
 */
export type NgnAmountResult = { ok: true; ngn: number } | { ok: false; reason: "invalid" };

export function ngnAmountForUsdc(usdc: number, rate: number): NgnAmountResult {
  if (!Number.isFinite(usdc) || usdc <= 0 || !Number.isFinite(rate) || rate <= 0) {
    return { ok: false, reason: "invalid" };
  }
  const ngn = Math.round(usdc * rate * 100) / 100;
  if (ngn <= 0) return { ok: false, reason: "invalid" };
  return { ok: true, ngn };
}
