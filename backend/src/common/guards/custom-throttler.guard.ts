import {
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ThrottlerGuard, ThrottlerLimitDetail } from '@nestjs/throttler';

/**
 * Custom throttler guard.
 *
 * What it adds over the default ThrottlerGuard:
 * 1. Standard IETF `RateLimit-*` headers (+ `Retry-After`) on every response,
 *    in addition to the `X-RateLimit-*-<name>` headers the base guard sets.
 * 2. A friendly JSON 429 body (instead of "ThrottlerException: Too Many Requests")
 *    that includes `retryAfter` seconds so clients can back off.
 *
 * Note: guards can't "respond" directly — they must throw. Throwing an
 * HttpException with a structured body is the idiomatic way to "respond
 * instead of throwing a raw ThrottlerException". Headers set on `res` before
 * throwing are preserved by Express and by HttpExceptionFilter.
 */
@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  /**
   * Rate-limit per real client, not per proxy hop.
   *
   * In production the API is only reachable through a Cloudflare Tunnel, so
   * `req.ip` is always the cloudflared container's IP and every user would
   * share one bucket. Cloudflare sets `cf-connecting-ip` to the visitor's IP
   * (overwriting any client-supplied value), so key on that when present.
   * Falls back to `req.ip` for local dev / direct connections.
   *
   * Only safe while the app has no public port that bypasses Cloudflare.
   */
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const cfIp = req.headers?.['cf-connecting-ip'];
    const ip = Array.isArray(cfIp) ? cfIp[0] : cfIp;
    return typeof ip === 'string' && ip.trim() ? ip.trim() : req.ip;
  }

  protected async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    const http = context.switchToHttp();
    const res = http.getResponse();
    const req = http.getRequest();

    const { limit, ttl, timeToExpire, timeToBlockExpire } =
      throttlerLimitDetail;

    // ttl in this codebase is configured in milliseconds.
    const ttlSeconds = Math.ceil(ttl / 1000);
    // timeToExpire / timeToBlockExpire from the storage are in seconds.
    const retryAfter = Math.max(
      1,
      Math.ceil(timeToBlockExpire ?? timeToExpire ?? ttlSeconds),
    );
    const remaining = 0;

    // Standard headers (IETF RateLimit header fields draft) + Retry-After.
    // These are non-suffixed so clients don't need to know our
    // short/medium/long throttler names.
    res.header('RateLimit-Limit', limit);
    res.header('RateLimit-Remaining', remaining);
    res.header('RateLimit-Reset', retryAfter);
    res.header('Retry-After', retryAfter);
    res.header('RateLimit-Policy', `${limit};w=${ttlSeconds}`);
    // Back-compat plain X-RateLimit-* aliases (base guard sets suffixed ones).
    res.header('X-RateLimit-Limit', limit);
    res.header('X-RateLimit-Remaining', remaining);
    res.header('X-RateLimit-Reset', retryAfter);

    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: 'Too Many Requests',
        message: `Rate limit exceeded for ${req.method} ${req.url}. Retry after ${retryAfter} second(s).`,
        retryAfter,
        limit,
        resetAfter: retryAfter,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  /**
   * Mirror the base success-path headers with the standard names so clients
   * get `RateLimit-*` on 2xx responses too, not just on 429s.
   */
  protected async handleRequest(requestProps: any): Promise<boolean> {
    const result = await super.handleRequest(requestProps);
    try {
      const { context, limit, ttl } = requestProps;
      const res = context.switchToHttp().getResponse();
      // Base guard already set X-RateLimit-*-<name>. Add generic aliases
      // from those values when present.
      const remaining =
        res.getHeader?.('X-RateLimit-Remaining-short') ??
        res.getHeader?.('X-RateLimit-Remaining');
      const reset =
        res.getHeader?.('X-RateLimit-Reset-short') ??
        res.getHeader?.('X-RateLimit-Reset');
      const ttlSeconds = Math.ceil((ttl ?? 60000) / 1000);
      if (res.header && remaining !== undefined) {
        res.header('RateLimit-Limit', limit);
        res.header('RateLimit-Remaining', remaining as number);
        res.header('RateLimit-Reset', reset as number);
        res.header('RateLimit-Policy', `${limit};w=${ttlSeconds}`);
      }
    } catch {
      // Headers are best-effort; never break the request because of them.
    }
    return result;
  }
}
