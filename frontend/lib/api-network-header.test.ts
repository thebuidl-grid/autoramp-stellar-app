import { afterEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/test/mocks/server";
import { adminApi } from "@/lib/api";
import { NETWORK_COOKIE } from "@/lib/network";

afterEach(() => localStorage.removeItem(NETWORK_COOKIE));

async function headerSent(): Promise<string | null> {
  let seen: string | null = null;
  server.use(
    http.get("http://localhost/api/admin/me", ({ request }) => {
      seen = request.headers.get("x-chain-network");
      return HttpResponse.json({ id: "a1" });
    }),
  );
  await adminApi.getMe();
  return seen;
}

describe("X-Chain-Network header", () => {
  it("sends the network the toggle is on, so the backend can record it", async () => {
    localStorage.setItem(NETWORK_COOKIE, "mainnet");
    expect(await headerSent()).toBe("mainnet");
    localStorage.setItem(NETWORK_COOKIE, "testnet");
    expect(await headerSent()).toBe("testnet");
  });
  it("falls back to the build default when the toggle was never used", async () => {
    expect(["testnet", "mainnet"]).toContain(await headerSent());
  });
});
