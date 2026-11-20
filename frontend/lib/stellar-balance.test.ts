import { describe, expect, it } from "vitest";
import { checkStellarFunds, parseHorizonAccount, toUnits, usdcNeededForSell } from "./stellar-balance";
import { STELLAR_USDC_ISSUER } from "./cctp-stellar";

const issuer = STELLAR_USDC_ISSUER.mainnet;
const account = (usdc: string, xlm: string, subentries = 1) => ({
  subentry_count: subentries,
  balances: [
    { asset_code: "USDC", asset_issuer: issuer, balance: usdc },
    { asset_type: "native", balance: xlm, selling_liabilities: "0.0000000" },
  ],
});

describe("stellar balances", () => {
  it("converts to 7dp units", () => {
    expect(toUnits("1.5")).toBe(15_000_000n);
    expect(toUnits("0.0000001")).toBe(1n);
    expect(toUnits(undefined)).toBe(0n);
  });

  it("reads USDC and the XLM left after the reserve", () => {
    // 2 + 1 subentry = 3 x 0.5 = 1.5 XLM reserve
    const f = parseHorizonAccount(account("10.0000000", "5.0000000"), "mainnet");
    expect(f.usdcUnits).toBe(100_000_000n);
    expect(f.spendableXlmStroops).toBe(35_000_000n);
  });

  it("ignores USDC from another issuer", () => {
    const f = parseHorizonAccount(
      { balances: [{ asset_code: "USDC", asset_issuer: "GOTHER", balance: "99" }, { asset_type: "native", balance: "5" }] },
      "mainnet",
    );
    expect(f.usdcUnits).toBe(0n);
  });

  it("blocks when USDC is short, and says by how much", () => {
    const f = parseHorizonAccount(account("2.0000000", "5.0000000"), "mainnet");
    const r = checkStellarFunds(f, toUnits("157.007875"));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("usdc");
      expect(r.message).toContain("2 USDC");
      expect(r.message).toContain("157.0079 USDC");
    }
  });

  it("blocks when there is no XLM to pay the fee", () => {
    const f = parseHorizonAccount(account("500.0000000", "1.6000000"), "mainnet");
    const r = checkStellarFunds(f, toUnits("10"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("xlm");
  });

  it("blocks an account that does not exist", () => {
    const r = checkStellarFunds({ exists: false, usdcUnits: 0n, spendableXlmStroops: 0n }, 1n);
    expect(r.ok).toBe(false);
  });

  it("passes with enough of both", () => {
    const f = parseHorizonAccount(account("500.0000000", "5.0000000"), "mainnet");
    expect(checkStellarFunds(f, toUnits("157"))).toEqual({ ok: true });
  });

  it("adds a margin for the transfer fee when sizing a sell", () => {
    expect(usdcNeededForSell(100)).toBe(toUnits("100.1"));
    expect(usdcNeededForSell(0)).toBe(0n);
  });
});
