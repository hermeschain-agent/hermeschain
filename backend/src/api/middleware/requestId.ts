import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

/**
 * Request-ID middleware (TASK-146). Echoes incoming X-Request-ID or
 * generates one. Available downstream as `req.id` (typed via module
 * augmentation below) and on every response as X-Request-ID for client
 * correlation in support tickets.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id: string;
    }
  }
}

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-request-id'];
  const id = typeof incoming === 'string' && incoming.length > 0 && incoming.length <= 128
    ? incoming
    : randomUUID();
  req.id = id;
  res.setHeader('X-Request-ID', id);
  next();
}
