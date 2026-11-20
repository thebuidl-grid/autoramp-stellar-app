import { describe, expect, it } from "vitest";
import { accountOwner, bridgeAmount, chainLabel, isTestChain } from "./safehaven";

describe("safehaven helpers", () => {
  it("shifts bridge amounts from micro-units without floats", () => {
    expect(bridgeAmount("10000000")).toBe("10");
    expect(bridgeAmount("3000000")).toBe("3");
    expect(bridgeAmount("1234567")).toBe("1.234567");
    expect(bridgeAmount("500")).toBe("0.0005");
    expect(bridgeAmount("0")).toBe("0");
    expect(bridgeAmount("abc")).toBeNull();
    expect(bridgeAmount(null)).toBeNull();
  });
  it("reads the network off the chain name", () => {
    expect(isTestChain("Base_Sepolia")).toBe(true);
    expect(isTestChain("Stellar_Testnet")).toBe(true);
    expect(isTestChain("Base")).toBe(false);
    expect(chainLabel("Stellar_Testnet")).toBe("Stellar Testnet");
  });
  it("names the owner of an account", () => {
    expect(accountOwner({ merchantName: "MihasPay", userEmail: null, merchantId: "m", userId: null })).toBe("MihasPay");
    expect(accountOwner({ merchantName: null, userEmail: "a@b.co", merchantId: null, userId: "u" })).toBe("a@b.co");
    expect(accountOwner({ merchantName: null, userEmail: null, merchantId: "m", userId: null })).toBe("A merchant");
    expect(accountOwner({ merchantName: null, userEmail: null, merchantId: null, userId: null })).toBeNull();
  });
});
