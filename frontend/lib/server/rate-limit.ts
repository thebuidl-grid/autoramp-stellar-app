/**
 * Small in-memory sliding-window limiter for route handlers that spend something scarce (a paid
 * API key, a relayer's fee balance). Per server instance and best effort: it blunts abuse and
 * accidental loops, it is not a substitute for an edge rate limit.
 */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
    private readonly maxKeys = 10_000,
  ) {}

  /** Returns true if the request is allowed (and counts it), false if the key is over the limit. */
  allow(key: string): boolean {
    const t = this.now();
    const recent = (this.hits.get(key) ?? []).filter((x) => t - x < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(t);
    if (!this.hits.has(key) && this.hits.size >= this.maxKeys) this.prune(t);
    this.hits.set(key, recent);
    return true;
  }

  /** Seconds until the key can make another request (for a Retry-After header). */
  retryAfterSeconds(key: string): number {
    const t = this.now();
    const recent = (this.hits.get(key) ?? []).filter((x) => t - x < this.windowMs);
    if (recent.length < this.limit) return 0;
    return Math.max(1, Math.ceil((recent[0] + this.windowMs - t) / 1000));
  }

  private prune(t: number): void {
    for (const [k, v] of this.hits) {
      if (!v.some((x) => t - x < this.windowMs)) this.hits.delete(k);
    }
    if (this.hits.size >= this.maxKeys) {
      const oldest = this.hits.keys().next().value;
      if (oldest !== undefined) this.hits.delete(oldest);
    }
  }
}

/** Best-effort caller key: Cloudflare's header, else the first X-Forwarded-For hop. */
export function callerKey(headers: Pick<Headers, "get">): string {
  const cf = headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
