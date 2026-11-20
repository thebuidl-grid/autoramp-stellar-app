import { describe, expect, it } from "vitest";
import { MIN_OFFRAMP_NGN, ngnAmountForUsdc } from "./offramp-amount";

describe("ngnAmountForUsdc", () => {
  it("converts USDC to naira at the given rate", () => {
    expect(ngnAmountForUsdc(1.25, 1600)).toEqual({ ok: true, ngn: 2000 });
    expect(ngnAmountForUsdc(3.125, 1600)).toEqual({ ok: true, ngn: 5000 });
  });
  it("rejects amounts below the naira minimum and says the minimum in USDC", () => {
    expect(ngnAmountForUsdc(1, 1600)).toEqual({ ok: false, reason: "below_minimum", minUsdc: 1.25 });
    expect(MIN_OFFRAMP_NGN).toBe(2000);
  });
  it("rejects invalid input or a missing rate", () => {
    for (const [u, r] of [[0, 1600], [-1, 1600], [NaN, 1600], [2, 0], [2, NaN]] as const) {
      expect(ngnAmountForUsdc(u, r)).toEqual({ ok: false, reason: "invalid" });
    }
  });
});
