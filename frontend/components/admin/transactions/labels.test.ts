import { describe, expect, it } from "vitest";
import { amountCurrency, isKnownTab, trackKindFor, transactionTypeLabel } from "./labels";

describe("transactionTypeLabel", () => {
  it("uses plain names, including for merchant variants and unknown types", () => {
    expect(transactionTypeLabel("offramp")).toBe("Off-ramp");
    expect(transactionTypeLabel("merchant_onramp")).toBe("Merchant on-ramp");
    expect(transactionTypeLabel("bank_transfer")).toBe("Bank transfer");
    expect(transactionTypeLabel("new_thing")).toBe("New thing");
    expect(transactionTypeLabel(undefined)).toBe("Unknown");
  });
});

describe("trackKindFor", () => {
  it("maps types to their step line, merchant variants to the user-side line, and bank transfers to none", () => {
    expect(trackKindFor("offramp")).toBe("OFFRAMP");
    expect(trackKindFor("merchant_offramp")).toBe("OFFRAMP");
    expect(trackKindFor("merchant_swap")).toBe("SWAP");
    expect(trackKindFor("vas")).toBe("VAS");
    expect(trackKindFor("bank_transfer")).toBeNull();
    expect(trackKindFor(undefined)).toBeNull();
  });
});

describe("amountCurrency — no naira sign on a token amount", () => {
  it("is naira only for types whose amount is naira", () => {
    for (const type of ["onramp", "merchant_onramp", "otc", "bank_transfer", "vas"]) expect(amountCurrency({ type })).toBe("NGN");
  });
  it("is unknown for off-ramps and swaps unless the API says which currency", () => {
    expect(amountCurrency({ type: "offramp" })).toBeNull();
    expect(amountCurrency({ type: "swap" })).toBeNull();
    expect(amountCurrency({ type: "offramp", currency: "usdc" })).toBe("USDC");
  });
});

describe("isKnownTab", () => {
  it("accepts the type tabs and the transfer logs tab only", () => {
    expect(isKnownTab("offramp")).toBe(true);
    expect(isKnownTab("transfer-logs")).toBe(true);
    expect(isKnownTab("nonsense")).toBe(false);
    expect(isKnownTab(null)).toBe(false);
  });
});
