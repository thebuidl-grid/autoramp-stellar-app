import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { http, HttpResponse } from "msw";
import { server } from "@/test/mocks/server";
import { GET, POST } from "./[...path]/route";

const BACKEND = "https://backend.internal.test";

const ctx = (...path: string[]) => ({ params: Promise.resolve({ path }) });
const req = (url: string, init?: RequestInit & { duplex?: string }) =>
  new NextRequest(`http://localhost:3030${url}`, init as never);

describe("/api/backend proxy", () => {
  beforeEach(() => {
    vi.stubEnv("API_URL", BACKEND);
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("forwards method, path, query and the auth header to the backend", async () => {
    let seen: { url: string; auth: string | null } | undefined;
    server.use(
      http.get(`${BACKEND}/admin/user-analytics`, ({ request }) => {
        seen = { url: request.url, auth: request.headers.get("authorization") };
        return HttpResponse.json({ ok: true });
      }),
    );

    const res = await GET(
      req("/api/backend/admin/user-analytics?days=30", { headers: { authorization: "Bearer abc" } }),
      ctx("admin", "user-analytics"),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(seen).toEqual({ url: `${BACKEND}/admin/user-analytics?days=30`, auth: "Bearer abc" });
  });

  it("forwards JSON bodies on POST and passes through error statuses", async () => {
    let body: unknown;
    server.use(
      http.post(`${BACKEND}/waitlist`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ message: "too many" }, { status: 429, headers: { "retry-after": "30" } });
      }),
    );

    const res = await POST(
      req("/api/backend/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "a@b.co" }),
        duplex: "half",
      }),
      ctx("waitlist"),
    );

    expect(body).toEqual({ email: "a@b.co" });
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("30");
  });

  it("forwards the visitor IP so backend rate limits are per visitor", async () => {
    let seen: Record<string, string | null> = {};
    server.use(
      http.get(`${BACKEND}/x`, ({ request }) => {
        seen = { cf: request.headers.get("cf-connecting-ip"), xff: request.headers.get("x-forwarded-for") };
        return HttpResponse.json({});
      }),
    );

    await GET(req("/api/backend/x", { headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" } }), ctx("x"));
    expect(seen).toEqual({ cf: "203.0.113.7", xff: "203.0.113.7" });

    await GET(req("/api/backend/x", { headers: { "cf-connecting-ip": "198.51.100.9" } }), ctx("x"));
    expect(seen.cf).toBe("198.51.100.9");
  });

  it("forwards the network toggle header, so the backend can record mainnet or testnet", async () => {
    let seen: string | null = null;
    server.use(
      http.get(`${BACKEND}/n`, ({ request }) => {
        seen = request.headers.get("x-chain-network");
        return HttpResponse.json({});
      }),
    );
    await GET(req("/api/backend/n", { headers: { "x-chain-network": "testnet" } }), ctx("n"));
    expect(seen).toBe("testnet");
  });

  it("forwards the visitor's edge country, and never a client-supplied one", async () => {
    let seen: string | null = "unset";
    server.use(
      http.get(`${BACKEND}/c`, ({ request }) => {
        seen = request.headers.get("x-visitor-country");
        return HttpResponse.json({});
      }),
    );

    await GET(req("/api/backend/c", { headers: { "cf-ipcountry": "gh" } }), ctx("c"));
    expect(seen).toBe("GH");

    await GET(req("/api/backend/c", { headers: { "x-vercel-ip-country": "KE" } }), ctx("c"));
    expect(seen).toBe("KE");

    // a spoofed header from the browser is dropped (allowlist), unknown/Tor pseudo-codes are ignored
    await GET(req("/api/backend/c", { headers: { "x-visitor-country": "US" } }), ctx("c"));
    expect(seen).toBeNull();
    await GET(req("/api/backend/c", { headers: { "cf-ipcountry": "XX" } }), ctx("c"));
    expect(seen).toBeNull();
    await GET(req("/api/backend/c", { headers: { "cf-ipcountry": "T1" } }), ctx("c"));
    expect(seen).toBeNull();
  });

  it("does not forward arbitrary client headers (e.g. cookies, host)", async () => {
    let seen: Record<string, string | null> = {};
    server.use(
      http.get(`${BACKEND}/y`, ({ request }) => {
        seen = { cookie: request.headers.get("cookie"), custom: request.headers.get("x-custom") };
        return HttpResponse.json({});
      }),
    );
    await GET(req("/api/backend/y", { headers: { cookie: "session=secret", "x-custom": "1" } }), ctx("y"));
    expect(seen).toEqual({ cookie: null, custom: null });
  });

  it("streams non-JSON responses with their headers (CSV export)", async () => {
    server.use(
      http.get(`${BACKEND}/admin/waitlist/export`, () =>
        new HttpResponse("email,source\n", {
          headers: { "content-type": "text/csv", "content-disposition": 'attachment; filename="waitlist.csv"' },
        }),
      ),
    );
    const res = await GET(req("/api/backend/admin/waitlist/export"), ctx("admin", "waitlist", "export"));
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain("waitlist.csv");
    expect(await res.text()).toBe("email,source\n");
  });

  it.each([["..", "etc"], [".", "x"], ["a/b"], ["a\\b"]])("rejects path traversal segments %j", async (...segs) => {
    const res = await GET(req("/api/backend/x"), ctx(...segs));
    expect(res.status).toBe(400);
  });

  it("returns a generic 502 that never leaks the backend URL when the backend is down", async () => {
    server.use(http.get(`${BACKEND}/down`, () => HttpResponse.error()));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await GET(req("/api/backend/down"), ctx("down"));
    const text = await res.text();

    expect(res.status).toBe(502);
    expect(text).not.toContain("backend.internal");
  });

  it("tells developers exactly what to set when API_URL is missing (non-production)", async () => {
    vi.stubEnv("API_URL", "");
    vi.stubEnv("NODE_ENV", "development");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await GET(req("/api/backend/x"), ctx("x"));
    expect(res.status).toBe(500);
    expect((await res.json()).message).toContain("API_URL");
    expect(JSON.stringify(res)).not.toContain(BACKEND);
  });

  it("returns a generic 500 in production when API_URL is missing", async () => {
    vi.stubEnv("API_URL", "");
    vi.stubEnv("NODE_ENV", "production");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await GET(req("/api/backend/x"), ctx("x"));
    expect(res.status).toBe(500);
    expect((await res.json()).message).toBe("Service is not configured");
  });
});
