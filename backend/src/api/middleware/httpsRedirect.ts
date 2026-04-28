import type { Request, Response, NextFunction } from 'express';

/**
 * HTTPS-only redirect middleware (TASK-360).
 *
 * In production behind a load balancer (Railway sets x-forwarded-proto),
 * issue a 301 to the https equivalent if the request came in over http.
 * No-op in development.
 */
export function httpsRedirect(req: Request, res: Response, next: NextFunction): void {
  if (process.env.NODE_ENV !== 'production') return next();
  const proto = req.headers['x-forwarded-proto'];
  if (proto && proto !== 'https') {
    const host = req.headers.host || '';
    return res.redirect(301, `https://${host}${req.originalUrl}`);
  }
  next();
}
