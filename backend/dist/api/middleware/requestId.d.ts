import type { Request, Response, NextFunction } from 'express';
/**
 * Request-ID middleware (TASK-146). Echoes incoming X-Request-ID or
 * generates one. Available downstream as `req.id` (typed via module
 * augmentation below) and on every response as X-Request-ID for client
 * correlation in support tickets.
 */
declare global {
    namespace Express {
        interface Request {
            id: string;
        }
    }
}
export declare function requestId(req: Request, res: Response, next: NextFunction): void;
//# sourceMappingURL=requestId.d.ts.map