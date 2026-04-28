import type { Express, Request, Response, NextFunction } from 'express';

/**
 * Backend Sentry integration (TASK-444).
 *
 * Lazy-init: only requires + initializes @sentry/node when SENTRY_DSN is
 * set, so the dep is optional. Without DSN, all helpers no-op.
 *
 * Mount the request handler before routes and the error handler last.
 */

let initialized = false;
let SentryRef: any = null;

function maybeInit(): void {
  if (initialized) return;
  if (!process.env.SENTRY_DSN) { initialized = true; return; }
  try {
    SentryRef = require('@sentry/node');
    SentryRef.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      release: process.env.HERMES_BUILD_COMMIT,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
    });
    console.log('[SENTRY] initialized');
  } catch (err: any) {
    console.warn(`[SENTRY] init skipped (missing @sentry/node?): ${err?.message || err}`);
  }
  initialized = true;
}

export function attachSentryRequestHandler(app: Express): void {
  maybeInit();
  if (!SentryRef) return;
  app.use(SentryRef.Handlers.requestHandler());
}

export function attachSentryErrorHandler(app: Express): void {
  maybeInit();
  if (!SentryRef) return;
  app.use(SentryRef.Handlers.errorHandler());
}

export function captureException(err: any, ctx?: Record<string, any>): void {
  maybeInit();
  if (!SentryRef) return;
  SentryRef.captureException(err, ctx ? { extra: ctx } : undefined);
}
