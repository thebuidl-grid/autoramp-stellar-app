/**
 * Counts failed attempts per key (e.g. "otp:SIGNUP:a@b.co", "login:a@b.co") and locks the key
 * out after too many, independent of the caller's IP. IP-based throttling alone is not enough
 * against distributed guessing of 6-digit codes or passwords.
 *
 * In-memory: it protects each running instance. With several replicas the effective limit is
 * `maxAttempts x replicas`, which is still a large improvement over no limit.
 */
export class AttemptLimiter {
  private readonly entries = new Map<
    string,
    { failures: number; windowStart: number; lockedUntil: number }
  >();

  constructor(
    private readonly maxAttempts: number,
    private readonly windowMs: number,
    private readonly lockMs: number,
    private readonly now: () => number = Date.now,
    private readonly maxKeys = 50_000,
  ) {}

  /** Milliseconds the key is still locked for (0 = not locked). */
  lockedFor(key: string): number {
    const e = this.entries.get(key);
    if (!e) return 0;
    const remaining = e.lockedUntil - this.now();
    if (remaining > 0) return remaining;
    if (this.now() - e.windowStart >= this.windowMs) this.entries.delete(key);
    return 0;
  }

  /** Records a failure. Returns true if this failure locked the key. */
  recordFailure(key: string): boolean {
    const t = this.now();
    let e = this.entries.get(key);
    if (!e || t - e.windowStart >= this.windowMs) {
      this.prune(t);
      e = { failures: 0, windowStart: t, lockedUntil: 0 };
      this.entries.set(key, e);
    }
    e.failures += 1;
    if (e.failures >= this.maxAttempts) {
      e.lockedUntil = t + this.lockMs;
      return true;
    }
    return false;
  }

  reset(key: string): void {
    this.entries.delete(key);
  }

  private prune(t: number): void {
    if (this.entries.size < this.maxKeys) return;
    for (const [k, e] of this.entries) {
      if (e.lockedUntil <= t && t - e.windowStart >= this.windowMs)
        this.entries.delete(k);
    }
    // still full of live entries: drop the oldest so memory stays bounded
    if (this.entries.size >= this.maxKeys) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
  }
}
