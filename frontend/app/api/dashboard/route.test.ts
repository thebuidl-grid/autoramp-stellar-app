import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { http, HttpResponse } from "msw";
import { server } from "@/test/mocks/server";
import { GET } from "./route";

const BACKEND = "https://backend.internal.test";

const req = (headers: Record<string, string> = {}) => new NextRequest("http://localhost:3030/api/dashboard", { headers });

describe("/api/dashboard", () => {
  beforeEach(() => {
    vi.stubEnv("API_URL", BACKEND);
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
    server.use(http.get("https://api.exchangerate-api.com/v4/latest/USD", () => HttpResponse.json({ rates: { NGN: 1500 } })));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("no longer trusts a self-declared x-admin-email: anonymous callers get 401 and nothing is fetched", async () => {
    let hits = 0;
    server.use(http.get(`${BACKEND}/data`, () => { hits += 1; return HttpResponse.json({}); }));
    for (const headers of [{}, { "x-admin-email": "admin@autoramp.com" }, { authorization: "Bearer " }]) {
      const res = await GET(req(headers));
      expect(res.status).toBe(401);
    }
    expect(hits).toBe(0);
  });

  it("forwards the admin's bearer token, not an email header", async () => {
    let seen: { auth: string | null; email: string | null } = { auth: null, email: null };
    server.use(
      http.get(`${BACKEND}/data`, ({ request }) => {
        seen = { auth: request.headers.get("authorization"), email: request.headers.get("x-admin-email") };
        return HttpResponse.json({ totalUsers: 52, totalTip: 3000 });
      }),
    );

    const res = await GET(req({ authorization: "Bearer admin-jwt", "x-admin-email": "admin@autoramp.com" }));

    expect(res.status).toBe(200);
    expect(seen).toEqual({ auth: "Bearer admin-jwt", email: null });
    const body = await res.json();
    expect(body.totalUsers).toBe(52);
    expect(body.totalTipUsd).toBeCloseTo(2);
  });

  it("passes 401/403 through with a generic message and hides backend errors", async () => {
    server.use(http.get(`${BACKEND}/data`, () => new HttpResponse(null, { status: 403 })));
    const forbidden = await GET(req({ authorization: "Bearer user-jwt" }));
    expect(forbidden.status).toBe(403);
    expect((await forbidden.json()).message).toBe("Admin access required");

    server.use(http.get(`${BACKEND}/data`, () => HttpResponse.json({ stack: "at Prisma ... secret-internal-detail" }, { status: 500 })));
    const broken = await GET(req({ authorization: "Bearer admin-jwt" }));
    expect(broken.status).toBe(502);
    expect(JSON.stringify(await broken.json())).not.toContain("secret-internal-detail");
  });
});
