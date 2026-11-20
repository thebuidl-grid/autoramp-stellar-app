import { describe, expect, it } from "vitest";
import { autoRampTransactionHref, bitnobErrorHint, bitnobTypeLabel, isAutoRampReference, parseBitnobAmount } from "./bitnob-format";

describe("parseBitnobAmount — the strings that showed up as '--5.000002 USDC USDC'", () => {
  it("strips the sign and currency Bitnob already put in amount_formatted", () => {
    expect(parseBitnobAmount({ amount_formatted: "-5.000002 USDC", currency: "USDC", side: "Debit" })).toEqual({ value: "5.000002", currency: "USDC", direction: "out" });
    expect(parseBitnobAmount({ amount_formatted: "+5.000253 USDC", currency: "USDC", side: "Credit" })).toEqual({ value: "5.000253", currency: "USDC", direction: "in" });
    expect(parseBitnobAmount({ amount_formatted: "-1.5 USDC", currency: "USDC", side: "Debit" })).toEqual({ value: "1.5", currency: "USDC", direction: "out" });
  });

  it("also works when the amount is plain, as in the API docs ('125')", () => {
    expect(parseBitnobAmount({ amount_formatted: "125", currency: "USDT", side: "Debit" })).toEqual({ value: "125", currency: "USDT", direction: "out" });
    expect(parseBitnobAmount({ amount_formatted: "0.145", currency: "BTC", side: "Credit" })).toEqual({ value: "0.145", currency: "BTC", direction: "in" });
  });

  it("falls back to the sign, then to the trailing currency, when side or currency are missing", () => {
    expect(parseBitnobAmount({ amount_formatted: "-12 USDC" })).toEqual({ value: "12", currency: "USDC", direction: "out" });
    expect(parseBitnobAmount({ amount_formatted: "+12 USDC" })).toEqual({ value: "12", currency: "USDC", direction: "in" });
    expect(parseBitnobAmount({ amount_formatted: "12 USDC" })).toEqual({ value: "12", currency: "USDC", direction: null });
  });

  it("handles thousands separators and the typographic minus", () => {
    expect(parseBitnobAmount({ amount_formatted: "−1,234.5 USDT", side: "Debit" })).toMatchObject({ value: "1234.5", direction: "out" });
  });

  it("returns no value, not a fake zero, when there is nothing to parse", () => {
    expect(parseBitnobAmount({})).toEqual({ value: null, currency: null, direction: null });
    expect(parseBitnobAmount({ amount_formatted: "n/a", currency: "USDC" }).value).toBeNull();
  });
});

describe("bitnobTypeLabel", () => {
  it("uses plain words", () => {
    expect(bitnobTypeLabel("DEPOSIT_CONFIRMED")).toBe("Deposit");
    expect(bitnobTypeLabel("PAYOUT")).toBe("Payout");
    expect(bitnobTypeLabel("P2P_TRANSFER")).toBe("Transfer");
    expect(bitnobTypeLabel("SOMETHING_NEW")).toBe("Something new");
    expect(bitnobTypeLabel(undefined)).toBe("Unknown");
  });
});

describe("our references", () => {
  it("recognises the references AutoRamp generates and not Bitnob's own", () => {
    for (const r of ["off_4uby6wYnBpq0b4B0", "txn_ref_G3Z6sb2kpae4P6pG", "otc_123", "BRG-1700000000-ab12"]) expect(isAutoRampReference(r)).toBe(true);
    for (const r of ["RCV_USDC_3b18018a1ce0", "TRD_x", "WDR_x", "rate-base-1", "", null, undefined]) expect(isAutoRampReference(r)).toBe(false);
  });
  it("builds a link to the transaction's trace", () => {
    expect(autoRampTransactionHref(" off_4uby6w/x ")).toBe("/admin/transactions/off_4uby6w%2Fx");
  });
});

describe("bitnobErrorHint", () => {
  it("points at the fix for the known failures and is silent otherwise", () => {
    expect(bitnobErrorHint("IP address not whitelisted", 403)).toMatch(/allowlist/);
    expect(bitnobErrorHint("Bitnob client id or secret not configured", 500)).toMatch(/BITNOB_CLIENT_ID/);
    expect(bitnobErrorHint("boom", 500)).toBeUndefined();
    expect(bitnobErrorHint(undefined)).toBeUndefined();
  });
});
