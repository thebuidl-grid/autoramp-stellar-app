import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { backendBaseUrl } from "@/lib/server/backend-url";

/**
 * Authenticated KYC document proxy: GET /api/docs/proxy?url=<cloudinary url>
 *
 * Admins only (the backend enforces that: it checks the bearer token's role). This route used to
 * fetch ANY URL it was given and return the response to anyone, which made it an open proxy
 * (SSRF to internal services and cloud metadata). It now:
 *  - requires an Authorization bearer token and forwards it to the backend, which does the check
 *  - only accepts https URLs on Cloudinary's own hosts, and only ever asks the backend for them
 *  - returns generic errors and never caches the document in shared caches
 */
export const dynamic = "force-dynamic";

const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];

export function isCloudinaryUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      (host === "cloudinary.com" || host.endsWith(".cloudinary.com"))
    );
  } catch {
    return false;
  }
}

function fail(status: number, message: string) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  if (!authorization || !/^Bearer\s+\S+$/i.test(authorization)) {
    return fail(401, "Authentication required");
  }

  const url = request.nextUrl.searchParams.get("url");
  if (!url) return fail(400, "Missing document URL");
  if (!isCloudinaryUrl(url)) return fail(400, "Only Cloudinary documents are supported");

  const base = backendBaseUrl();
  if (!base) {
    console.error("[docs proxy] API_URL is not configured");
    return fail(500, "Service is not configured");
  }

  try {
    const response = await axios.get<ArrayBuffer>(`${base}/uploads/proxy`, {
      params: { url },
      headers: { Authorization: authorization },
      responseType: "arraybuffer",
      timeout: 30_000,
      maxRedirects: 0,
      maxContentLength: MAX_BYTES,
    });

    const upstreamType = String(response.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
    // Never let an uploaded file be served as HTML/SVG/script from our origin.
    const contentType = ALLOWED_TYPES.includes(upstreamType) ? upstreamType : "application/octet-stream";

    return new NextResponse(response.data, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    if (status === 401 || status === 403) return fail(status, "Not authorized to view this document");
    if (status === 400 || status === 404) return fail(status, "Document not found");
    console.error("[docs proxy] upstream failure", status ?? (error instanceof Error ? error.message : error));
    return fail(502, "Failed to fetch document");
  }
}
