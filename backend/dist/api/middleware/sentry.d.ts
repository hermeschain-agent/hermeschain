import type { Express } from 'express';
export declare function attachSentryRequestHandler(app: Express): void;
export declare function attachSentryErrorHandler(app: Express): void;
export declare function captureException(err: any, ctx?: Record<string, any>): void;
//# sourceMappingURL=sentry.d.ts.map