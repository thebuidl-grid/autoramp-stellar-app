import { AttemptLimiter } from './attempt-limiter';
import { securityHeaders } from './security-headers.middleware';
import { authenticateWebhook, safeEqual } from './webhook-auth.util';

describe('safeEqual', () => {
  it('compares equal and unequal strings, including different lengths', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(safeEqual('', 'a')).toBe(false);
  });
});

describe('authenticateWebhook', () => {
  const base = { nodeEnv: 'production' as string | undefined };

  it('requires the configured token and compares it exactly', () => {
    expect(
      authenticateWebhook({
        ...base,
        expectedToken: 's3cret',
        providedToken: 's3cret',
      }),
    ).toEqual({ ok: true, reason: 'verified' });
    expect(
      authenticateWebhook({
        ...base,
        expectedToken: 's3cret',
        providedToken: ' s3cret ',
      }).ok,
    ).toBe(true); // whitespace trimmed
    expect(
      authenticateWebhook({
        ...base,
        expectedToken: 's3cret',
        providedToken: 'wrong',
      }),
    ).toEqual({ ok: false, reason: 'invalid-token' });
    expect(
      authenticateWebhook({
        ...base,
        expectedToken: 's3cret',
        providedToken: undefined,
      }),
    ).toEqual({ ok: false, reason: 'missing-token' });
    expect(
      authenticateWebhook({
        ...base,
        expectedToken: 's3cret',
        providedToken: '',
      }),
    ).toEqual({ ok: false, reason: 'missing-token' });
  });

  it('a configured token is enforced in every environment, even with the escape hatch', () => {
    for (const nodeEnv of ['production', 'development', 'test', undefined]) {
      expect(
        authenticateWebhook({
          nodeEnv,
          expectedToken: 's',
          providedToken: 'x',
          allowUnauthenticated: true,
        }).ok,
      ).toBe(false);
    }
  });

  it('refuses unconfigured webhooks in production (fail closed)', () => {
    expect(
      authenticateWebhook({
        ...base,
        expectedToken: undefined,
        providedToken: 'anything',
      }),
    ).toEqual({ ok: false, reason: 'unconfigured-refused' });
    expect(
      authenticateWebhook({
        ...base,
        expectedToken: '   ',
        providedToken: undefined,
      }),
    ).toEqual({ ok: false, reason: 'unconfigured-refused' });
  });

  it('allows unconfigured webhooks outside production, and via the explicit escape hatch', () => {
    expect(
      authenticateWebhook({
        nodeEnv: 'development',
        expectedToken: undefined,
        providedToken: undefined,
      }),
    ).toEqual({ ok: true, reason: 'unconfigured-allowed' });
    expect(
      authenticateWebhook({
        ...base,
        expectedToken: undefined,
        providedToken: undefined,
        allowUnauthenticated: true,
      }),
    ).toEqual({ ok: true, reason: 'explicitly-unauthenticated' });
  });
});

describe('AttemptLimiter', () => {
  let t = 1_000_000;
  const make = (max = 3, window = 60_000, lock = 120_000) =>
    new AttemptLimiter(max, window, lock, () => t);
  beforeEach(() => {
    t = 1_000_000;
  });

  it('locks a key after the maximum failures and reports how long', () => {
    const l = make();
    expect(l.recordFailure('k')).toBe(false);
    expect(l.recordFailure('k')).toBe(false);
    expect(l.lockedFor('k')).toBe(0);
    expect(l.recordFailure('k')).toBe(true);
    expect(l.lockedFor('k')).toBe(120_000);
    t += 30_000;
    expect(l.lockedFor('k')).toBe(90_000);
  });

  it('unlocks after the lock period', () => {
    const l = make();
    for (let i = 0; i < 3; i++) l.recordFailure('k');
    t += 120_001;
    expect(l.lockedFor('k')).toBe(0);
    expect(l.recordFailure('k')).toBe(false); // a fresh window begins
  });

  it('forgets old failures once the window passes', () => {
    const l = make();
    l.recordFailure('k');
    l.recordFailure('k');
    t += 60_001;
    expect(l.recordFailure('k')).toBe(false);
    expect(l.recordFailure('k')).toBe(false);
    expect(l.recordFailure('k')).toBe(true);
  });

  it('keeps keys independent and reset() clears one', () => {
    const l = make(2);
    l.recordFailure('a');
    l.recordFailure('a');
    expect(l.lockedFor('a')).toBeGreaterThan(0);
    expect(l.lockedFor('b')).toBe(0);
    l.reset('a');
    expect(l.lockedFor('a')).toBe(0);
  });

  it('keeps memory bounded', () => {
    const l = new AttemptLimiter(3, 60_000, 120_000, () => t, 100);
    for (let i = 0; i < 1000; i++) l.recordFailure(`key-${i}`);
    expect((l as any).entries.size).toBeLessThanOrEqual(100);
  });
});

describe('securityHeaders', () => {
  const run = (path: string) => {
    const headers: Record<string, string> = {};
    const res: any = {
      setHeader: (k: string, v: string) => (headers[k] = v),
      removeHeader: jest.fn(),
    };
    const next = jest.fn();
    securityHeaders()({ path } as any, res, next);
    return { headers, res, next };
  };

  it('sets the hardening headers and calls next', () => {
    const { headers, res, next } = run('/user/profile');
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['X-Frame-Options']).toBe('DENY');
    expect(headers['Referrer-Policy']).toBe('no-referrer');
    expect(headers['Strict-Transport-Security']).toContain('max-age=');
    expect(headers['Content-Security-Policy']).toContain("default-src 'none'");
    expect(headers['Cache-Control']).toBe('no-store');
    expect(res.removeHeader).toHaveBeenCalledWith('X-Powered-By');
    expect(next).toHaveBeenCalled();
  });

  it('leaves the CSP off the Swagger UI so it still loads', () => {
    const { headers } = run('/docs');
    expect(headers['Content-Security-Policy']).toBeUndefined();
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
  });
});
