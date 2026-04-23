# Log Correlation IDs

**Task:** phase-08 / logging-correlation / step-1 (design)

## Why

A single request fans out across multiple subsystems — API handler → state read → cache check → mempool admit → gossip. Debugging a specific failure requires correlating logs from all of them. Without a shared ID, you're grep-and-guessing.

## Shape

Every inbound request gets a correlation ID on entry:

```
X-Request-Id: <uuid> or generated if missing
```

The ID flows through:
- Structured logger via `log.child({ traceId })`.
- Downstream fetches as `X-Request-Id`.
- Emitted events as `traceId` field.
- Error responses as `requestId` in the body.

## Client-side

The SDK generates a UUIDv4 per request, attaches the header, and preserves the server's echoed `requestId` in thrown errors. Users reporting bugs can include the ID.

## Server-side propagation

The API middleware reads (or generates) the ID, stashes it in an AsyncLocalStorage context, and every subsystem that calls `currentTraceId()` gets the same value without explicit threading.

```ts
import { AsyncLocalStorage } from 'async_hooks';

const als = new AsyncLocalStorage<{ traceId: string }>();

export function runWithTrace<T>(traceId: string, fn: () => T): T {
  return als.run({ traceId }, fn);
}

export function currentTraceId(): string | null {
  return als.getStore()?.traceId ?? null;
}
```

## Propagation to async jobs

A tx admitted on thread A but executed in a block on thread B retains its original trace ID via a field on `PooledTransaction`. Logs from both threads correlate.

## Retention

Trace IDs are never hashed / obfuscated — they're operational telemetry, not user data. Log retention policy (90 days for error-level) applies uniformly.

## Non-goals

- No distributed-tracing (OpenTelemetry) in this rev. The shared request ID is 80% of the value at 5% of the complexity.
