import { describe, expect, it } from "vitest";
import { normalizePhone, userTypeLabel, validateWaitlistForm, type WaitlistForm } from "./waitlist";

const valid: WaitlistForm = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  phoneNumber: "+234 801 234 5678",
  userType: "freelancer",
};

describe("validateWaitlistForm", () => {
  it("accepts a complete form", () => {
    expect(validateWaitlistForm(valid)).toEqual({});
  });

  it("requires every field", () => {
    const errors = validateWaitlistForm({ name: "", email: "", phoneNumber: "", userType: "" });
    expect(Object.keys(errors).sort()).toEqual(["email", "name", "phoneNumber", "userType"]);
  });

  it.each([
    ["one-letter name", { name: "A" }, "name"],
    ["whitespace-only name", { name: "    " }, "name"],
    ["80+ char name", { name: "a".repeat(81) }, "name"],
    ["bad email", { email: "nope" }, "email"],
    ["short phone", { phoneNumber: "12345" }, "phoneNumber"],
    ["letters in phone", { phoneNumber: "+23480abc4567" }, "phoneNumber"],
    ["16-digit phone", { phoneNumber: "1".repeat(16) }, "phoneNumber"],
    ["blank phone", { phoneNumber: "   " }, "phoneNumber"],
  ])("rejects %s", (_l, patch, field) => {
    expect(validateWaitlistForm({ ...valid, ...patch })).toHaveProperty(field);
  });

  it("accepts common phone formats", () => {
    for (const p of ["+234 (801) 234-5678", "08012345678", "+1 555.123.4567"]) {
      expect(validateWaitlistForm({ ...valid, phoneNumber: p })).toEqual({});
    }
  });
});

describe("helpers", () => {
  it("normalizePhone strips formatting like the backend", () => {
    expect(normalizePhone("+234 (801) 234-5678")).toBe("+2348012345678");
  });

  it("userTypeLabel maps slugs and handles missing/unknown", () => {
    expect(userTypeLabel("cross_border")).toBe("Cross-border");
    expect(userTypeLabel("crypto_native")).toBe("Crypto-native");
    expect(userTypeLabel("unknown")).toBe("Not provided");
    expect(userTypeLabel(null)).toBe("Not provided");
    expect(userTypeLabel("future_type")).toBe("future_type");
  });
});
