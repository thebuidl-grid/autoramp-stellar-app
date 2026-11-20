import { describe, expect, it } from "vitest";
import {
  EMPTY_WAITLIST_FORM,
  composePhone,
  readOrigin,
  timeAgo,
  userTypeLabel,
  validateWaitlistForm,
  type WaitlistForm,
} from "./waitlist";

const valid: WaitlistForm = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  phoneCountry: "NG",
  phoneNumber: "801 234 5678",
  userType: "freelancer",
};

describe("validateWaitlistForm", () => {
  it("accepts a complete form", () => {
    expect(validateWaitlistForm(valid)).toEqual({});
  });

  it("requires every field", () => {
    const errors = validateWaitlistForm(EMPTY_WAITLIST_FORM);
    expect(Object.keys(errors).sort()).toEqual(["email", "name", "phoneNumber", "userType"]);
  });

  it.each([
    ["one-letter name", { name: "A" }, "name"],
    ["whitespace-only name", { name: "    " }, "name"],
    ["80+ char name", { name: "a".repeat(81) }, "name"],
    ["bad email", { email: "nope" }, "email"],
    ["short number", { phoneNumber: "123" }, "phoneNumber"],
    ["letters in number", { phoneNumber: "80abc45678" }, "phoneNumber"],
    ["too many digits", { phoneNumber: "1".repeat(16) }, "phoneNumber"],
    ["blank number", { phoneNumber: "   " }, "phoneNumber"],
  ])("rejects %s", (_l, patch, field) => {
    expect(validateWaitlistForm({ ...valid, ...patch })).toHaveProperty(field);
  });

  it("accepts common ways of typing a number for the selected country", () => {
    for (const phoneNumber of ["08012345678", "801-234-5678", "(801) 234 5678", "801.234.5678"]) {
      expect(validateWaitlistForm({ ...valid, phoneNumber })).toEqual({});
    }
    expect(validateWaitlistForm({ ...valid, phoneCountry: "GH", phoneNumber: "024 123 4567" })).toEqual({});
  });
});

describe("composePhone", () => {
  it("builds the international number the API receives", () => {
    expect(composePhone(valid)).toBe("+2348012345678");
    expect(composePhone({ phoneCountry: "KE", phoneNumber: "0712 345 678" })).toBe("+254712345678");
  });
});

describe("userTypeLabel", () => {
  it("maps slugs and handles missing/unknown", () => {
    expect(userTypeLabel("cross_border")).toBe("Cross-border");
    expect(userTypeLabel("crypto_native")).toBe("Crypto-native");
    expect(userTypeLabel("unknown")).toBe("Not provided");
    expect(userTypeLabel(null)).toBe("Not provided");
    expect(userTypeLabel("future_type")).toBe("future_type");
  });
});

describe("readOrigin", () => {
  const here = { hostname: "useautoramp.com", search: "" };

  it("returns nothing for a direct visit", () => {
    expect(readOrigin(here, "")).toEqual({});
  });

  it("captures the referring hostname without www or path", () => {
    expect(readOrigin(here, "https://www.twitter.com/some/post?x=1")).toEqual({ referrer: "twitter.com" });
  });

  it("ignores our own site as a referrer", () => {
    expect(readOrigin(here, "https://www.useautoramp.com/")).toEqual({});
  });

  it("ignores a malformed referrer", () => {
    expect(readOrigin(here, "not a url")).toEqual({});
  });

  it("reads utm tags, trimmed, and skips empty ones", () => {
    expect(
      readOrigin(
        { ...here, search: "?utm_source=%20twitter%20&utm_medium=social&utm_campaign=&ref=x" },
        "https://t.co/abc",
      ),
    ).toEqual({ referrer: "t.co", utmSource: "twitter", utmMedium: "social" });
  });

  it("caps very long utm values", () => {
    expect(readOrigin({ ...here, search: `?utm_source=${"a".repeat(300)}` }, "").utmSource).toHaveLength(100);
  });
});

describe("timeAgo", () => {
  const now = 1_000_000_000_000;
  it.each([
    [now - 1_000, "just now"],
    [now - 4_000, "just now"],
    [now - 12_000, "12s ago"],
    [now - 59_000, "59s ago"],
    [now - 60_000, "1m ago"],
    [now - 185_000, "3m ago"],
    [now - 3_600_000, "1h ago"],
    [now - 7_300_000, "2h ago"],
    [now + 5_000, "just now"], // a clock slightly ahead never shows a negative time
    [0, "never"],
  ])("%d -> %s", (then, expected) => {
    expect(timeAgo(then, now)).toBe(expected);
  });
});
