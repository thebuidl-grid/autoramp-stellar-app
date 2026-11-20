import { describe, expect, it } from "vitest";
import { sparklinePoints } from "./sparkline";

describe("sparklinePoints", () => {
  it("is empty for no data and ignores non-finite values", () => {
    expect(sparklinePoints([])).toBe("");
    expect(sparklinePoints([Number.NaN, Number.POSITIVE_INFINITY])).toBe("");
  });
  it("draws the highest value at the top and the lowest at the bottom, left to right", () => {
    const pts = sparklinePoints([0, 10], 100, 20, 0).split(" ").map((p) => p.split(",").map(Number));
    expect(pts[0]).toEqual([0, 20]);
    expect(pts[1]).toEqual([100, 0]);
  });
  it("puts a flat series in the middle, and a single point on the left edge", () => {
    expect(sparklinePoints([5, 5, 5], 100, 20, 0)).toBe("0.0,10.0 50.0,10.0 100.0,10.0");
    expect(sparklinePoints([7], 100, 20, 2)).toBe("2.0,10.0");
  });
});
