import { NextRequest, NextResponse } from "next/server";
import { RateLimiter, callerKey } from "@/lib/server/rate-limit";

// Quotes are requested as the user types, so the limit is generous; it exists to stop a script
// from burning the paid 0x API key, not to slow a person down.
const limiter = new RateLimiter(120, 60_000);

/** Returns a 429 response when this caller is over the limit, otherwise null. */
export function limitQuotes(request: NextRequest): NextResponse | null {
  const key = callerKey(request.headers);
  if (limiter.allow(key)) return null;
  return NextResponse.json(
    { error: "Too many requests. Please slow down." },
    { status: 429, headers: { "Retry-After": String(limiter.retryAfterSeconds(key)) } },
  );
}
