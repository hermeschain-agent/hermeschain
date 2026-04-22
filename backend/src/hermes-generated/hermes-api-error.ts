/**
 * Shared HermesApiError + code-to-http map.
 *
 * Phase-8 / errors / step-2. Used by the API layer to convert a
 * thrown error into a response, and by the SDK to throw a typed
 * error that consumers can switch on.
 */

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'INVALID_SIGNATURE'
  | 'INVALID_NONCE'
  | 'INSUFFICIENT_BALANCE'
  | 'MEMPOOL_FULL'
  | 'MEMPOOL_DUPLICATE'
  | 'RATE_LIMITED'
  | 'KEY_REVOKED'
  | 'KEY_EXPIRED'
  | 'NOT_FOUND'
  | 'CHAIN_ERROR'
  | 'BUDGET_EXCEEDED'
  | 'CIRCUIT_BREAKER_OPEN'
  | 'UNAVAILABLE';

export class HermesApiError extends Error {
  public readonly code: ErrorCode;
  public readonly details?: Record<string, unknown>;
  public readonly httpStatus: number;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'HermesApiError';
    this.code = code;
    this.details = details;
    this.httpStatus = CODE_TO_HTTP[code];
  }

  toResponse(): { error: { code: ErrorCode; message: string; details?: Record<string, unknown> } } {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }
}

const CODE_TO_HTTP: Readonly<Record<ErrorCode, number>> = Object.freeze({
  BAD_REQUEST: 400,
  INVALID_SIGNATURE: 400,
  INVALID_NONCE: 400,
  INSUFFICIENT_BALANCE: 400,
  MEMPOOL_FULL: 503,
  MEMPOOL_DUPLICATE: 409,
  RATE_LIMITED: 429,
  KEY_REVOKED: 401,
  KEY_EXPIRED: 401,
  NOT_FOUND: 404,
  CHAIN_ERROR: 500,
  BUDGET_EXCEEDED: 503,
  CIRCUIT_BREAKER_OPEN: 503,
  UNAVAILABLE: 503,
});

/** Convert an arbitrary error into a HermesApiError for response mapping. */
export function toApiError(err: unknown): HermesApiError {
  if (err instanceof HermesApiError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new HermesApiError('CHAIN_ERROR', `Unexpected: ${message}`);
}
