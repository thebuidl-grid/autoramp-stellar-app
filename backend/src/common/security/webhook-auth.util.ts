import { createHash, timingSafeEqual } from 'crypto';

/** Compares two secrets in constant time (hashing first so lengths don't leak). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export type WebhookAuthResult =
  | {
      ok: true;
      reason:
        | 'verified'
        | 'unconfigured-allowed'
        | 'explicitly-unauthenticated';
    }
  | {
      ok: false;
      reason: 'missing-token' | 'invalid-token' | 'unconfigured-refused';
    };

export interface WebhookAuthInput {
  /** The secret we expect (from env). Empty/undefined = not configured. */
  expectedToken: string | undefined;
  /** What the caller sent (x-webhook-token header or ?token= query). */
  providedToken: string | undefined;
  nodeEnv: string | undefined;
  /** WEBHOOK_ALLOW_UNAUTHENTICATED=true: explicit, logged escape hatch for rollout. */
  allowUnauthenticated?: boolean;
}

/**
 * Decides whether an inbound provider webhook is authentic.
 *
 * - Token configured: the caller MUST present it (constant-time compare).
 * - Not configured in production: refused, because anyone who can reach the URL could otherwise
 *   forge "payment received" events. `allowUnauthenticated` is an explicit opt-out for rollout.
 * - Not configured outside production: allowed, so local development keeps working.
 */
export function authenticateWebhook(
  input: WebhookAuthInput,
): WebhookAuthResult {
  const expected = input.expectedToken?.trim();
  if (expected) {
    const provided = input.providedToken?.trim();
    if (!provided) return { ok: false, reason: 'missing-token' };
    return safeEqual(provided, expected)
      ? { ok: true, reason: 'verified' }
      : { ok: false, reason: 'invalid-token' };
  }
  if (input.allowUnauthenticated)
    return { ok: true, reason: 'explicitly-unauthenticated' };
  if (input.nodeEnv === 'production')
    return { ok: false, reason: 'unconfigured-refused' };
  return { ok: true, reason: 'unconfigured-allowed' };
}
