import { describe, expect, it } from "vitest";
import { formatAmount, formatMoney } from "./money";

describe("formatAmount (string math, no floats)", () => {
  it("groups thousands and pads/rounds to the requested fraction", () => {
    expect(formatAmount("1234567.891")).toBe("1,234,567.89");
    expect(formatAmount("5")).toBe("5.00");
    expect(formatAmount("0.5")).toBe("0.50");
    expect(formatAmount("1000", { maxFraction: 0 })).toBe("1,000");
  });
  it("rounds half up on the digits, so classic float traps come out right", () => {
    expect(formatAmount("1.005")).toBe("1.01"); // 1.005 * 100 = 100.49999 in floating point
    expect(formatAmount("2.675")).toBe("2.68");
    expect(formatAmount("0.995")).toBe("1.00");
    expect(formatAmount("9.995")).toBe("10.00");
  });
  it("keeps precision beyond what a float can hold", () => {
    expect(formatAmount("12345678901234567890.12")).toBe("12,345,678,901,234,567,890.12");
    expect(formatAmount("0.1234567891", { maxFraction: 8 })).toBe("0.12345679");
  });
  it("handles negatives and never shows negative zero", () => {
    expect(formatAmount("-1200.5")).toBe("-1,200.50");
    expect(formatAmount("-0.001")).toBe("0.00");
  });
  it("can trim trailing zeros for crypto with minFraction", () => {
    expect(formatAmount("100.50000000", { maxFraction: 8, minFraction: 0 })).toBe("100.5");
    expect(formatAmount("100.00000000", { maxFraction: 8, minFraction: 0 })).toBe("100");
  });
  it("shows a dash for empty values and leaves non-decimal text alone", () => {
    expect(formatAmount(null)).toBe("—");
    expect(formatAmount(undefined)).toBe("—");
    expect(formatAmount("")).toBe("—");
    expect(formatAmount("n/a")).toBe("n/a");
  });
  it("accepts numbers without scientific notation", () => {
    expect(formatAmount(1500000)).toBe("1,500,000.00");
    expect(formatAmount(0.0000001, { maxFraction: 8, minFraction: 0 })).toBe("0.0000001");
  });
});

describe("formatMoney", () => {
  it("puts fiat symbols in front and crypto codes after", () => {
    expect(formatMoney("149700", "NGN")).toBe("₦149,700.00");
    expect(formatMoney("5000", "KES")).toBe("KSh 5,000.00");
    expect(formatMoney("100", "USDC")).toBe("100.00 USDC");
    expect(formatMoney("0.00147059", "BTC")).toBe("0.00147059 BTC");
  });
  it("uses the typographic minus and an explicit plus for statements", () => {
    expect(formatMoney("-149700", "NGN")).toBe("−₦149,700.00");
    expect(formatMoney("100", "USDC", { signed: true })).toBe("+100.00 USDC");
    expect(formatMoney("0", "NGN", { signed: true })).toBe("+₦0.00");
  });
  it("copes with unknown currencies and missing values", () => {
    expect(formatMoney("12.5", "XYZ")).toBe("12.5 XYZ");
    expect(formatMoney("12.5", null)).toBe("12.5");
    expect(formatMoney(null, "NGN")).toBe("—");
  });
});
