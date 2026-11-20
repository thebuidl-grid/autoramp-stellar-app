import { describe, expect, it } from "vitest";
import { remainingSteps, setupSteps } from "./setup";

describe("setupSteps", () => {
  it("lists everything as left to do for a brand new merchant", () => {
    const steps = setupSteps({ onboarding: null, hasMerchantRecord: false, hasBankAccount: false, apiKeyCount: 0 });
    expect(remainingSteps(steps).map((s) => s.key)).toEqual(["business", "bank", "keys"]);
  });
  it("is complete when verified, banked and keyed", () => {
    const steps = setupSteps({ onboarding: "VERIFIED", hasMerchantRecord: true, hasBankAccount: true, apiKeyCount: 2 });
    expect(remainingSteps(steps)).toEqual([]);
  });
  it("explains a pending or rejected verification in plain words", () => {
    expect(setupSteps({ onboarding: "PENDING", hasMerchantRecord: true, hasBankAccount: false, apiKeyCount: 0 })[0].hint).toMatch(/under review/i);
    expect(setupSteps({ onboarding: "REJECTED", hasMerchantRecord: true, hasBankAccount: false, apiKeyCount: 0 })[0].hint).toMatch(/resubmit/i);
  });
});
