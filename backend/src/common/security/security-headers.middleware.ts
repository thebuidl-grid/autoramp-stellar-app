import type { NextFunction, Request, Response } from 'express';

/**
 * Baseline hardening headers for a JSON API (a small, dependency-free subset of what `helmet`
 * sets). The Swagger UI (development only, under /docs) needs scripts and styles, so it keeps
 * the headers except the restrictive Content-Security-Policy.
 */
export function securityHeaders() {
  return (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains',
    );
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=()',
    );
    if (!req.path.startsWith('/docs')) {
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; frame-ancestors 'none'",
      );
    }
    // API responses carry personal and financial data: never let a shared cache keep them.
    // (A route that needs caching sets its own Cache-Control afterwards.)
    res.setHeader('Cache-Control', 'no-store');
    res.removeHeader('X-Powered-By');
    next();
  };
}
