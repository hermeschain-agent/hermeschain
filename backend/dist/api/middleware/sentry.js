"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.attachSentryRequestHandler = attachSentryRequestHandler;
exports.attachSentryErrorHandler = attachSentryErrorHandler;
exports.captureException = captureException;
/**
 * Backend Sentry integration (TASK-444).
 *
 * Lazy-init: only requires + initializes @sentry/node when SENTRY_DSN is
 * set, so the dep is optional. Without DSN, all helpers no-op.
 *
 * Mount the request handler before routes and the error handler last.
 */
let initialized = false;
let SentryRef = null;
function maybeInit() {
    if (initialized)
        return;
    if (!process.env.SENTRY_DSN) {
        initialized = true;
        return;
    }
    try {
        SentryRef = require('@sentry/node');
        SentryRef.init({
            dsn: process.env.SENTRY_DSN,
            environment: process.env.NODE_ENV || 'development',
            release: process.env.HERMES_BUILD_COMMIT,
            tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
        });
        console.log('[SENTRY] initialized');
    }
    catch (err) {
        console.warn(`[SENTRY] init skipped (missing @sentry/node?): ${err?.message || err}`);
    }
    initialized = true;
}
function attachSentryRequestHandler(app) {
    maybeInit();
    if (!SentryRef)
        return;
    app.use(SentryRef.Handlers.requestHandler());
}
function attachSentryErrorHandler(app) {
    maybeInit();
    if (!SentryRef)
        return;
    app.use(SentryRef.Handlers.errorHandler());
}
function captureException(err, ctx) {
    maybeInit();
    if (!SentryRef)
        return;
    SentryRef.captureException(err, ctx ? { extra: ctx } : undefined);
}
//# sourceMappingURL=sentry.js.map