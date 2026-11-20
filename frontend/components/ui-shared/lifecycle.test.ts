import { describe, expect, it } from "vitest";
import { buildTrack, describeTrack, lifecycleFor } from "./lifecycle";

const states = (kind: string, status: string, reached?: string) => buildTrack(kind, status, { reachedStatus: reached }).map((n) => n.state);

describe("buildTrack — off-ramp", () => {
  it("marks earlier steps done and the live one current", () => {
    expect(states("OFFRAMP", "AWAITING_DEPOSIT")).toEqual(["done", "current", "upcoming", "upcoming", "upcoming", "upcoming"]);
    expect(states("OFFRAMP", "PAYOUT_PENDING")).toEqual(["done", "done", "done", "done", "current", "upcoming"]);
  });
  it("shows a finished transaction fully done, with no pulsing node", () => {
    expect(states("OFFRAMP", "COMPLETED")).toEqual(["done", "done", "done", "done", "done", "done"]);
  });
  it("marks the step a failure stopped at, using where it got to", () => {
    expect(states("OFFRAMP", "FAILED", "PAYOUT_PENDING")).toEqual(["done", "done", "done", "done", "failed", "upcoming"]);
    expect(states("OFFRAMP", "EXPIRED", "AWAITING_DEPOSIT")).toEqual(["done", "warn", "upcoming", "upcoming", "upcoming", "upcoming"]);
  });
  it("puts a failure with no known progress after the first step, not at the end", () => {
    expect(states("OFFRAMP", "FAILED")).toEqual(["done", "failed", "upcoming", "upcoming", "upcoming", "upcoming"]);
  });
  it("flags partial settlement and low liquidity on the payout step", () => {
    expect(states("OFFRAMP", "PARTIALLY_SETTLED")).toEqual(["done", "done", "done", "done", "warn", "upcoming"]);
    expect(states("OFFRAMP", "INSUFFICIENT_LIQUIDITY")).toEqual(["done", "done", "done", "done", "warn", "upcoming"]);
  });
  it("has exactly one current node while in progress and none otherwise", () => {
    const count = (s: string) => buildTrack("OFFRAMP", s).filter((n) => n.state === "current").length;
    for (const s of ["INITIATED", "AWAITING_DEPOSIT", "DEPOSIT_DETECTED", "PROCESSING", "PAYOUT_PENDING"]) expect(count(s)).toBe(1);
    for (const s of ["COMPLETED", "FAILED", "EXPIRED", "PARTIALLY_SETTLED"]) expect(count(s)).toBe(0);
  });
});

describe("buildTrack — other types", () => {
  it("uses a three-step line for on-ramps, swaps and bridges", () => {
    expect(lifecycleFor("ONRAMP")).toHaveLength(3);
    expect(states("SWAP", "PROCESSING")).toEqual(["done", "current", "upcoming"]);
    expect(states("BRIDGE", "COMPLETED")).toEqual(["done", "done", "done"]);
    expect(states("ONRAMP", "FAILED", "PROCESSING")).toEqual(["done", "failed", "upcoming"]);
  });
  it("falls back to a generic line for unknown types and statuses", () => {
    expect(lifecycleFor("nonsense")).toHaveLength(3);
    expect(states("SWAP", "mystery")).toEqual(["current", "upcoming", "upcoming"]);
  });
});

describe("describeTrack", () => {
  it("summarises for screen readers and tooltips", () => {
    expect(describeTrack(buildTrack("OFFRAMP", "PAYOUT_PENDING"))).toBe("Step 5 of 6: Paying out");
    expect(describeTrack(buildTrack("OFFRAMP", "FAILED", { reachedStatus: "PAYOUT_PENDING" }))).toBe("Failed at Paying out");
    expect(describeTrack(buildTrack("OFFRAMP", "PARTIALLY_SETTLED"))).toBe("Needs attention at Paying out");
    expect(describeTrack(buildTrack("OFFRAMP", "COMPLETED"))).toBe("Done: Paid");
  });
});
