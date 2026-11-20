import { describe, expect, it } from "vitest";
import { activityCurrency, activityDetail, activityLabel } from "./activity";

describe("merchant activity rows", () => {
  it("names each kind of transaction in plain words", () => {
    expect(activityLabel("onramp")).toBe("Customer payment");
    expect(activityLabel("offramp")).toBe("Payout to bank");
    expect(activityLabel("wat")).toBe("Transaction");
  });
  it("summarises where it went", () => {
    expect(activityDetail({ type: "swap", details: { fromTokenType: "USDC", toTokenType: "cNGN" } })).toBe("USDC to cNGN");
    expect(activityDetail({ type: "offramp", details: { bankCode: "058", accountNumber: "0123456789" } })).toBe("058 · 0123456789");
    expect(activityDetail({ type: "bank_transfer", details: { narration: "Invoice 12" } })).toBe("Invoice 12");
    expect(activityDetail({ type: "onramp", details: {} })).toBe("");
  });
  it("puts a naira sign only on naira rows", () => {
    expect(activityCurrency({ type: "bank_transfer", details: {} })).toBe("NGN");
    expect(activityCurrency({ type: "onramp", details: {} })).toBe("NGN");
    expect(activityCurrency({ type: "offramp", details: {} })).toBe("USDC");
    expect(activityCurrency({ type: "swap", details: { fromTokenType: "USDT" } })).toBe("USDT");
  });
});

import { activityIds, feeBreakdown, feeName } from "./activity";

describe("fees, net and identifiers", () => {
  it("adds fees exactly and subtracts them from the amount", () => {
    expect(feeBreakdown(149700, "NGN", [{ type: "provider_fee", amount: "50.10", currency: "NGN" }, { type: "vat", amount: "3.75", currency: "NGN" }])).toEqual({ total: "53.85", net: "149646.15" });
    expect(feeBreakdown("0.3", "NGN", [{ type: "a", amount: "0.1", currency: "NGN" }, { type: "b", amount: "0.2", currency: "NGN" }])).toEqual({ total: "0.3", net: "0" });
  });
  it("shows nothing when there are no fees or they are in another currency", () => {
    expect(feeBreakdown(100, "NGN", undefined)).toBeNull();
    expect(feeBreakdown(100, "NGN", [])).toBeNull();
    expect(feeBreakdown(100, "USDC", [{ type: "x", amount: "1", currency: "NGN" }])).toBeNull();
  });
  it("names fees in plain words", () => {
    expect(feeName("platform_fee")).toBe("Our fee");
    expect(feeName("stamp_duty")).toBe("Stamp duty");
    expect(feeName("some_new_fee")).toBe("Some new fee");
  });
  it("lists the identifiers that exist, in order", () => {
    expect(activityIds({ reference: "r1", details: { providerReference: "p9", transactionHash: "0xabc" } }).map((i) => i.label)).toEqual(["Reference", "Provider reference", "Transaction hash"]);
    expect(activityIds({ reference: "r1", details: {} })).toEqual([{ label: "Reference", value: "r1" }]);
  });
});
