import type { Request, Response, NextFunction } from 'express';

/**
 * NDJSON access log + slow-request log (TASK-147 + TASK-148).
 *
 * Emits one JSON-line per request to stdout: ts, method, path, status,
 * durationMs, bytes, requestId, ip. Easily fed into Logflare/Datadog/Axiom.
 *
 * Requests over SLOW_REQUEST_MS (default 1000) get tagged `slow:true` and
 * also emit a console.warn so they surface in noisy log streams.
 */

const SLOW_REQUEST_MS = Math.max(1, Number(process.env.SLOW_REQUEST_MS || '1000'));

export function accessLog(req: Request, res: Response, next: NextFunction): void {
  const startedAt = Date.now();
  res.on('finish', () => {
    const durationMs = Date.now() - startedAt;
    const slow = durationMs > SLOW_REQUEST_MS;
    const line = {
      ts: new Date().toISOString(),
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs,
      bytes: Number(res.getHeader('content-length') ?? 0),
      requestId: (req as any).id,
      ip: req.ip,
      slow,
    };
    if (slow) {
      console.warn('[ACCESS SLOW]', JSON.stringify(line));
    } else {
      console.log(JSON.stringify(line));
    }
  });
  next();
}
