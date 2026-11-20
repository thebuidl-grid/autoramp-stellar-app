import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { http, HttpResponse } from "msw";
import { server } from "@/test/mocks/server";
import { GET, isCloudinaryUrl } from "./route";

const BACKEND = "https://backend.internal.test";
const DOC = "https://res.cloudinary.com/demo/raw/upload/v1/kyc/passport.pdf";

const req = (url: string | null, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost:3030/api/docs/proxy${url === null ? "" : `?url=${encodeURIComponent(url)}`}`, { headers });

describe("isCloudinaryUrl", () => {
  it.each([DOC, "https://cloudinary.com/x", "https://res.cloudinary.com/a/b.png"])("accepts %s", (u) => {
    expect(isCloudinaryUrl(u)).toBe(true);
  });

  it.each([
    "https://evil.com/?x=cloudinary.com",
    "https://evil.com/cloudinary.com/a.pdf",
    "https://cloudinary.com.evil.com/a.pdf",
    "https://evilcloudinary.com/a.pdf",
    "http://res.cloudinary.com/a.pdf",
    "https://user:pw@res.cloudinary.com/a.pdf",
    "https://res.cloudinary.com@evil.com/a.pdf",
    "http://169.254.169.254/latest/meta-data/?cloudinary.com",
    "file:///etc/passwd#cloudinary.com",
    "not a url",
    "",
  ])("rejects %s", (u) => {
    expect(isCloudinaryUrl(u)).toBe(false);
  });
});

describe("/api/docs/proxy", () => {
  beforeEach(() => {
    vi.stubEnv("API_URL", BACKEND);
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const backend = (handler: () => Response, seen?: { auth?: string | null; url?: string | null; hits: number }) =>
    server.use(
      http.get(`${BACKEND}/uploads/proxy`, ({ request }) => {
        if (seen) {
          seen.hits += 1;
          seen.auth = request.headers.get("authorization");
          seen.url = new URL(request.url).searchParams.get("url");
        }
        return handler();
      }),
    );

  it("refuses anonymous requests without calling the backend", async () => {
    const seen = { hits: 0 };
    backend(() => HttpResponse.arrayBuffer(new ArrayBuffer(1)), seen);
    for (const headers of [{}, { authorization: "" }, { authorization: "Basic abc" }, { authorization: "Bearer " }]) {
      const res = await GET(req(DOC, headers));
      expect(res.status).toBe(401);
    }
    expect(seen.hits).toBe(0);
  });

  it.each([
    "https://evil.com/?x=cloudinary.com",
    "http://169.254.169.254/latest/meta-data/?x=cloudinary.com",
    "http://localhost:3003/admin/me?cloudinary.com",
    "https://cloudinary.com.evil.com/a.pdf",
    "file:///etc/passwd",
  ])("refuses to fetch %s (this route used to be an open SSRF proxy)", async (url) => {
    const seen = { hits: 0 };
    backend(() => HttpResponse.arrayBuffer(new ArrayBuffer(1)), seen);
    const res = await GET(req(url, { authorization: "Bearer tok" }));
    expect(res.status).toBe(400);
    expect(seen.hits).toBe(0);
  });

  it("requires a url", async () => {
    const res = await GET(req(null, { authorization: "Bearer tok" }));
    expect(res.status).toBe(400);
  });

  it("forwards the caller's token and the Cloudinary URL, and serves the document privately", async () => {
    const seen = { hits: 0 } as { auth?: string | null; url?: string | null; hits: number };
    backend(() => HttpResponse.arrayBuffer(new TextEncoder().encode("%PDF-1.7").buffer, { headers: { "content-type": "application/pdf" } }), seen);

    const res = await GET(req(DOC, { authorization: "Bearer admin-token" }));

    expect(res.status).toBe(200);
    expect(seen.auth).toBe("Bearer admin-token");
    expect(seen.url).toBe(DOC);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await res.text()).toBe("%PDF-1.7");
  });

  it("never serves an uploaded file as HTML/SVG from our origin", async () => {
    backend(() => HttpResponse.arrayBuffer(new TextEncoder().encode("<script>alert(1)</script>").buffer, { headers: { "content-type": "text/html; charset=utf-8" } }));
    const res = await GET(req(DOC, { authorization: "Bearer t" }));
    expect(res.headers.get("content-type")).toBe("application/octet-stream");
    backend(() => HttpResponse.arrayBuffer(new ArrayBuffer(4), { headers: { "content-type": "image/svg+xml" } }));
    expect((await GET(req(DOC, { authorization: "Bearer t" }))).headers.get("content-type")).toBe("application/octet-stream");
  });

  it("passes authorization failures through and hides everything else", async () => {
    backend(() => new HttpResponse(null, { status: 403 }));
    expect((await GET(req(DOC, { authorization: "Bearer user-token" }))).status).toBe(403);
    backend(() => new HttpResponse(null, { status: 401 }));
    expect((await GET(req(DOC, { authorization: "Bearer expired" }))).status).toBe(401);

    backend(() => HttpResponse.json({ message: "connect ECONNREFUSED 10.0.0.9:5432 secret-internal-detail" }, { status: 500 }));
    const res = await GET(req(DOC, { authorization: "Bearer t" }));
    const body = await res.text();
    expect(res.status).toBe(502);
    expect(body).not.toContain("secret-internal-detail");
    expect(body).not.toContain("backend.internal");
  });
});
