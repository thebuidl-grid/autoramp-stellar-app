import { NextRequest, NextResponse } from "next/server";
import { backendBaseUrl } from "@/lib/server/backend-url";

/**
 * Same-origin proxy to the Autoramp backend.
 *
 * The browser only ever talks to `/api/backend/*`; the real backend URL lives
 * in the server-only `API_URL` env var and is never shipped to the client.
 *
 * - Only an allowlist of request/response headers is forwarded.
 * - The visitor's IP is forwarded as `cf-connecting-ip` / `x-forwarded-for` so
 *   the backend's per-IP rate limits apply per visitor, not per Next server.
 * - Path segments are validated so a request can never escape the backend base URL.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REQUEST_HEADERS = [
  "authorization",
  "content-type",
  "accept",
  "accept-language",
  "x-api-key",
  "user-agent",
];
const RESPONSE_HEADERS = [
  "content-type",
  "content-disposition",
  "cache-control",
  "retry-after",
  "x-request-id",
];
const TIMEOUT_MS = 60_000;

type Ctx = { params: Promise<{ path: string[] }> };

function clientIp(req: NextRequest): string | undefined {
  const cf = req.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const xff = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (xff) return xff;
  return req.headers.get("x-real-ip")?.trim() || undefined;
}

function error(status: number, message: string) {
  return NextResponse.json({ statusCode: status, message }, { status });
}

async function proxy(req: NextRequest, ctx: Ctx): Promise<Response> {
  const base = backendBaseUrl();
  if (!base) {
    console.error("[api proxy] API_URL is not configured");
    return error(500, "Service is not configured");
  }

  const { path } = await ctx.params;
  if (
    !path?.length ||
    path.some((s) => !s || s === "." || s === ".." || /[\\/]/.test(s))
  ) {
    return error(400, "Invalid path");
  }
  const target = `${base}/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;

  const headers = new Headers();
  for (const name of REQUEST_HEADERS) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }
  const ip = clientIp(req);
  if (ip) {
    headers.set("cf-connecting-ip", ip);
    headers.set("x-forwarded-for", ip);
  }

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: hasBody ? req.body : undefined,
      // Required by Node's fetch when streaming a request body.
      ...(hasBody ? { duplex: "half" } : {}),
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    } as RequestInit);

    const out = new Headers();
    for (const name of RESPONSE_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) out.set(name, value);
    }
    const noBody = [101, 204, 205, 304].includes(upstream.status);
    return new Response(noBody ? null : upstream.body, {
      status: upstream.status,
      headers: out,
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    // Never include the target URL in the response.
    console.error(`[api proxy] ${req.method} /${path.join("/")} failed:`, err);
    return timedOut
      ? error(504, "The service took too long to respond")
      : error(502, "The service is temporarily unavailable");
  }
}

export {
  proxy as GET,
  proxy as POST,
  proxy as PUT,
  proxy as PATCH,
  proxy as DELETE,
};
