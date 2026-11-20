import { describe, expect, it } from "vitest";
import { adminLinks, type TraceHalf } from "./tracker";

const leg = (provider: string, over: Record<string, unknown> = {}) => ({ id: provider, role: "X", provider, providerReference: null, status: null, expectedAmount: null, receivedAmount: null, outstandingAmount: null, fundingAddress: null, depositTxHash: null, failedStep: null, failureReason: null, lastEventAt: null, createdAt: "2026-11-20T00:00:00.000Z", ...over });
const half = (over: Record<string, unknown> = {}) => ({ transaction: { id: "t", type: "offramp", scope: "USER", reference: "off_a/b", status: "X", amount: null, currency: null, ownerId: null, createdAt: "", updatedAt: null }, legs: [], virtualAccount: null, ...over }) as unknown as Pick<TraceHalf, "transaction" | "legs" | "virtualAccount">;

describe("adminLinks", () => {
  it("links a Bitnob payout to the Bitnob page by our reference, encoded", () => {
    expect(adminLinks(half({ legs: [leg("BITNOB")] }))).toEqual([{ label: "See on the Bitnob page", href: "/admin/bitnob?reference=off_a%2Fb" }]);
  });
  it("links the virtual account to the Safehaven page, else a Safehaven leg to its transactions", () => {
    const va = { accountNumber: "601" } as never;
    expect(adminLinks(half({ virtualAccount: va, legs: [leg("SAFEHAVEN")] })).map((l) => l.href)).toEqual(["/admin/safehaven?q=601"]);
    expect(adminLinks(half({ legs: [leg("SAFEHAVEN", { providerReference: "SH 9" })] })).map((l) => l.href)).toEqual(["/admin/safehaven?tab=transactions&q=SH%209"]);
    expect(adminLinks(half({ legs: [leg("SAFEHAVEN")] })).map((l) => l.href)).toEqual(["/admin/safehaven?tab=transactions&q=off_a%2Fb"]);
  });
  it("links a bridge to the CCTP page, and offers nothing for a transaction with none of these", () => {
    expect(adminLinks(half({ legs: [leg("CCTP")] })).map((l) => l.href)).toEqual(["/admin/cctp?q=off_a%2Fb"]);
    expect(adminLinks(half())).toEqual([]);
  });
});
