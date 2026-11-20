import { describe, expect, it } from "vitest";
import { DEFAULT_DEPOSIT_BANK_NAME, depositBankName } from "./deposit-bank";

describe("depositBankName", () => {
  it("uses the bank name from the API when present", () => {
    expect(depositBankName({ bankName: "Wema Bank" })).toBe("Wema Bank");
  });
  it("falls back to SafeHaven when missing, empty or blank", () => {
    expect(depositBankName({})).toBe(DEFAULT_DEPOSIT_BANK_NAME);
    expect(depositBankName({ bankName: "" })).toBe(DEFAULT_DEPOSIT_BANK_NAME);
    expect(depositBankName({ bankName: "  " })).toBe(DEFAULT_DEPOSIT_BANK_NAME);
    expect(depositBankName(undefined)).toBe(DEFAULT_DEPOSIT_BANK_NAME);
  });
});
