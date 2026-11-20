import { describe, expect, it } from "vitest";
import { RateLimiter, callerKey } from "./rate-limit";

describe("RateLimiter", () => {
  it("allows up to the limit per window, then refuses", () => {
    let t = 0;
    const l = new RateLimiter(3, 60_000, () => t);
    expect([l.allow("a"), l.allow("a"), l.allow("a"), l.allow("a")]).toEqual([true, true, true, false]);
  });

  it("frees capacity as old requests leave the window", () => {
    let t = 0;
    const l = new RateLimiter(2, 60_000, () => t);
    l.allow("a");
    t = 30_000;
    l.allow("a");
    expect(l.allow("a")).toBe(false);
    t = 60_001; // the first request has aged out
    expect(l.allow("a")).toBe(true);
    expect(l.allow("a")).toBe(false);
  });

  it("keeps callers independent", () => {
    const l = new RateLimiter(1, 60_000);
    expect(l.allow("a")).toBe(true);
    expect(l.allow("b")).toBe(true);
    expect(l.allow("a")).toBe(false);
  });

  it("reports a sensible Retry-After", () => {
    let t = 0;
    const l = new RateLimiter(1, 60_000, () => t);
    l.allow("a");
    t = 10_000;
    expect(l.retryAfterSeconds("a")).toBe(50);
    expect(l.retryAfterSeconds("never-seen")).toBe(0);
  });

  it("keeps memory bounded", () => {
    const l = new RateLimiter(1, 60_000, Date.now, 100);
    for (let i = 0; i < 1000; i++) l.allow(`k${i}`);
    expect((l as unknown as { hits: Map<string, number[]> }).hits.size).toBeLessThanOrEqual(100);
  });
});

describe("callerKey", () => {
  const h = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null });
  it("prefers Cloudflare's header, then the first forwarded hop", () => {
    expect(callerKey(h({ "cf-connecting-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2" }))).toBe("1.1.1.1");
    expect(callerKey(h({ "x-forwarded-for": "2.2.2.2, 10.0.0.1" }))).toBe("2.2.2.2");
    expect(callerKey(h({}))).toBe("unknown");
  });
});
