/**
 * Trace context via AsyncLocalStorage.
 *
 * Phase-8 / logging-correlation / step-2. Thin wrapper so any code
 * in the request's async tree can call currentTraceId() without the
 * caller threading it through every signature.
 */

import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';

export interface TraceContext {
  readonly traceId: string;
  readonly parentId?: string;
  readonly startMs: number;
}

const storage = new AsyncLocalStorage<TraceContext>();

export function runWithTrace<T>(
  input: { traceId?: string; parentId?: string },
  fn: () => T,
): T {
  const context: TraceContext = {
    traceId: input.traceId ?? randomUUID(),
    parentId: input.parentId,
    startMs: Date.now(),
  };
  return storage.run(context, fn);
}

export function currentContext(): TraceContext | null {
  return storage.getStore() ?? null;
}

export function currentTraceId(): string | null {
  return storage.getStore()?.traceId ?? null;
}

/**
 * Produce the standard log field set for a structured logger. Empty
 * object when no active context so logs outside a request (boot,
 * background jobs) just omit the field.
 */
export function traceFields(): Record<string, unknown> {
  const ctx = storage.getStore();
  if (!ctx) return {};
  return {
    traceId: ctx.traceId,
    ...(ctx.parentId ? { parentId: ctx.parentId } : {}),
    requestAgeMs: Date.now() - ctx.startMs,
  };
}
