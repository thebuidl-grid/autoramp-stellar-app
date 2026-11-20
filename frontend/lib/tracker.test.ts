import { describe, expect, it } from "vitest";
import { formatAge, formatGap, lastReachedStatus, legTone, orderLegs, traceUrl, type TimelineEntry } from "./tracker";

const leg = (over: Record<string, unknown> = {}) => ({ role: "PAYOUT", createdAt: "2026-11-20T10:00:00Z", status: null, failedStep: null, lastEventAt: null, ...over }) as never;

describe("legTone", () => {
  it("is danger as soon as a step failed, whatever the leg's own status says", () => {
    expect(legTone(leg({ failedStep: "attestation", status: "PENDING" }))).toBe("danger");
  });
  it("reads the provider's status words", () => {
    expect(legTone(leg({ status: "payout.settled" }))).toBe("ok");
    expect(legTone(leg({ status: "SUCCESS" }))).toBe("ok");
    expect(legTone(leg({ status: "payout.failed" }))).toBe("danger");
    expect(legTone(leg({ status: "PENDING" }))).toBe("live");
    expect(legTone(leg({ status: "payout.created" }))).toBe("live");
  });
  it("is idle when nothing has happened, and follows a completed transaction when no status was reported", () => {
    expect(legTone(leg())).toBe("idle");
    expect(legTone(leg({ lastEventAt: "2026-11-20T10:05:00Z" }), "COMPLETED")).toBe("ok");
    expect(legTone(leg({ lastEventAt: "2026-11-20T10:05:00Z" }), "PENDING")).toBe("live");
  });
});

describe("orderLegs", () => {
  it("puts legs in the order money moves, then by start time", () => {
    const out = orderLegs([
      { role: "PAYOUT", createdAt: "2026-11-20T10:00:00Z", id: "p" },
      { role: "BRIDGE", createdAt: "2026-11-20T10:05:00Z", id: "b" },
      { role: "FUNDING", createdAt: "2026-11-20T10:09:00Z", id: "f" },
      { role: "BRIDGE", createdAt: "2026-11-20T10:01:00Z", id: "b0" },
    ]);
    expect(out.map((l) => l.id)).toEqual(["f", "b0", "b", "p"]);
  });
});

describe("lastReachedStatus", () => {
  const log = (from: string | null, to: string | null): TimelineEntry => ({ at: "x", kind: "log", title: "t", from, to });
  it("is null unless it stopped", () => {
    expect(lastReachedStatus([log("INITIATED", "AWAITING_DEPOSIT")], "AWAITING_DEPOSIT")).toBeNull();
  });
  it("finds the status it was in before failing", () => {
    const tl = [log("INITIATED", "AWAITING_DEPOSIT"), log("AWAITING_DEPOSIT", "DEPOSIT_DETECTED"), log("DEPOSIT_DETECTED", "EXPIRED")];
    expect(lastReachedStatus(tl, "EXPIRED")).toBe("DEPOSIT_DETECTED");
  });
  it("falls back to the last non-final status in the log", () => {
    expect(lastReachedStatus([log(null, "PROCESSING")], "FAILED")).toBe("PROCESSING");
    expect(lastReachedStatus([], "FAILED")).toBeNull();
  });
});

describe("helpers", () => {
  it("formats ages", () => {
    expect(formatAge(0)).toBe("0m");
    expect(formatAge(45)).toBe("45m");
    expect(formatAge(125)).toBe("2h 5m");
    expect(formatAge(120)).toBe("2h");
    expect(formatAge(60 * 24 * 3 + 60 * 4)).toBe("3d 4h");
    expect(formatAge(-5)).toBe("0m");
  });
  it("formats the gap between two steps", () => {
    expect(formatGap(0)).toBe("+0s");
    expect(formatGap(45_000)).toBe("+45s");
    expect(formatGap(200_000)).toBe("+3m 20s");
    expect(formatGap(180_000)).toBe("+3m");
    expect(formatGap(2 * 3_600_000 + 5 * 60_000)).toBe("+2h 5m");
    expect(formatGap(-10)).toBe("+0s");
  });
  it("encodes references in trace links", () => {
    expect(traceUrl(" off_4uby6w/x ")).toBe("/admin/transactions/off_4uby6w%2Fx");
  });
});
