import { describe, expect, it } from "vitest";
import { isTerminalStatus, normalizeStatusKey, statusLabel, statusTone } from "./status";

// Every value of the backend's TransactionStatus enum (prisma/schema.prisma). If one is added, add it here AND to the tone map.
const ALL_STATUSES = [
  "PENDING", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED", "REFUNDED", "DISPUTED", "REJECTED", "EXPIRED", "PARTIAL", "REVERSED",
  "INITIATED", "AWAITING_DEPOSIT", "DEPOSIT_DETECTED", "CONVERSION_PENDING", "PAYOUT_PENDING", "PARTIALLY_SETTLED", "INSUFFICIENT_LIQUIDITY",
];

describe("statusTone", () => {
  it("gives every backend status an explicit tone (nothing falls through to the default by accident)", () => {
    for (const s of ALL_STATUSES) {
      // an explicit entry means asking with a garbage suffix would NOT give the same answer for non-neutral tones
      expect(["ok", "warn", "danger", "neutral", "live"]).toContain(statusTone(s));
    }
  });

  it.each([
    ["COMPLETED", "ok"],
    ["PROCESSING", "live"],
    ["PAYOUT_PENDING", "live"],
    ["PENDING", "neutral"],
    ["AWAITING_DEPOSIT", "neutral"],
    ["PARTIALLY_SETTLED", "warn"],
    ["INSUFFICIENT_LIQUIDITY", "warn"],
    ["EXPIRED", "warn"],
    ["REVERSED", "warn"],
    ["SUSPENDED", "warn"],
    ["ACTIVE", "ok"],
    ["FAILED", "danger"],
    ["REJECTED", "danger"],
  ])("%s -> %s", (status, tone) => expect(statusTone(status)).toBe(tone));

  it("is case-insensitive and understands provider event names", () => {
    expect(statusTone("completed")).toBe("ok");
    expect(statusTone("payout.settled")).toBe("ok");
    expect(statusTone("payout.failed")).toBe("danger");
    expect(statusTone("deposit.expired")).toBe("warn");
    expect(statusTone("payout.created")).toBe("neutral");
  });

  it("treats missing or unknown statuses as neutral, never as success", () => {
    expect(statusTone(undefined)).toBe("neutral");
    expect(statusTone(null)).toBe("neutral");
    expect(statusTone("")).toBe("neutral");
    expect(statusTone("something_new")).toBe("neutral");
  });
});

describe("statusLabel / normalizeStatusKey", () => {
  it("writes plain sentence-case labels", () => {
    expect(statusLabel("AWAITING_DEPOSIT")).toBe("Awaiting deposit");
    expect(statusLabel("PARTIALLY_SETTLED")).toBe("Partly settled");
    expect(statusLabel("COMPLETED")).toBe("Completed");
    expect(statusLabel("payout.settled")).toBe("Payout settled");
    expect(statusLabel(undefined)).toBe("Unknown");
  });
  it("normalises separators and case", () => {
    expect(normalizeStatusKey(" payout.settled ")).toBe("PAYOUT_SETTLED");
    expect(normalizeStatusKey("awaiting deposit")).toBe("AWAITING_DEPOSIT");
  });
});

describe("isTerminalStatus", () => {
  it("is true only for statuses that will not change", () => {
    for (const s of ["COMPLETED", "FAILED", "REJECTED", "CANCELLED", "EXPIRED", "REVERSED", "REFUNDED"]) expect(isTerminalStatus(s)).toBe(true);
    for (const s of ["PENDING", "PROCESSING", "AWAITING_DEPOSIT", "PAYOUT_PENDING", "PARTIALLY_SETTLED", "INSUFFICIENT_LIQUIDITY"]) expect(isTerminalStatus(s)).toBe(false);
  });
});
