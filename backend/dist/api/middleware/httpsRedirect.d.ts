import type { Request, Response, NextFunction } from 'express';
/**
 * HTTPS-only redirect middleware (TASK-360).
 *
 * In production behind a load balancer (Railway sets x-forwarded-proto),
 * issue a 301 to the https equivalent if the request came in over http.
 * No-op in development.
 */
export declare function httpsRedirect(req: Request, res: Response, next: NextFunction): void;
//# sourceMappingURL=httpsRedirect.d.ts.map