import { describe, expect, it } from "vitest";
import { normalizeRampResponse } from "./ramp-response";

describe("normalizeRampResponse", () => {
  it("exposes a flat off-ramp response under data", () => {
    const body = {
      status: "success",
      databaseRecord: { reference: "off_1" },
      deposit: { receiveAddress: "0xabc", amount: "3" },
    };
    const n = normalizeRampResponse(body);
    expect(n.data.deposit.receiveAddress).toBe("0xabc");
    expect(n.data.databaseRecord.reference).toBe("off_1");
    expect(n.databaseRecord.reference).toBe("off_1");
  });

  it("maps a flat on-ramp virtual account to depositAccount", () => {
    const n = normalizeRampResponse({
      databaseRecord: { reference: "onr_1" },
      deposit: { accountNumber: "123", bankName: "Bank" },
    });
    expect(n.data.depositAccount.accountNumber).toBe("123");
  });

  it("leaves an already-wrapped response alone", () => {
    const body = { data: { depositAccount: { accountNumber: "9" } } };
    expect(normalizeRampResponse(body)).toBe(body);
  });
});
