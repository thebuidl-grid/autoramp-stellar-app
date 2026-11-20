import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

const post = (body: unknown, ip: string) =>
  POST(
    new NextRequest("http://localhost:3030/api/bridge/stellar-relay", {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": ip },
      body: JSON.stringify(body),
    }),
  );

describe("/api/bridge/stellar-relay abuse protection", () => {
  const bad = { burnTxHash: "nope", sourceDomain: 6, network: "testnet" };

  it("rate limits anonymous callers per IP (each relay can cost the relayer fees)", async () => {
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) codes.push((await post(bad, "203.0.113.50")).status);
    expect(codes.slice(0, 10)).toEqual(Array(10).fill(400)); // validated, no relay attempted
    expect(codes.slice(10)).toEqual([429, 429]);
  });

  it("sends Retry-After and keeps other callers unaffected", async () => {
    for (let i = 0; i < 10; i++) await post(bad, "203.0.113.60");
    const limited = await post(bad, "203.0.113.60");
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await post(bad, "203.0.113.61")).status).toBe(400);
  });

  it("rejects absurd source domains and malformed hashes without relaying", async () => {
    const hash = "0x" + "ab".repeat(32);
    expect((await post({ burnTxHash: hash, sourceDomain: 99999, network: "testnet" }, "203.0.113.70")).status).toBe(400);
    expect((await post({ burnTxHash: hash, sourceDomain: -1, network: "testnet" }, "203.0.113.70")).status).toBe(400);
    expect((await post({ burnTxHash: hash, sourceDomain: 6, network: "localnet" }, "203.0.113.70")).status).toBe(400);
  });
});
