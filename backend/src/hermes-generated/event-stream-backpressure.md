# Event Stream Backpressure

**Task:** phase-07 / backpressure / step-1 (audit)

## Current state

The SSE channel at `/api/agent/stream` pushes events as they happen. If a client's connection is slow, events buffer on the server side indefinitely — a single dead client eats memory until the connection finally times out.

## Target

Per-client event queue with bounded capacity. When the queue fills, drop policy kicks in:

1. **Low-value events first**: `ping`, `heartbeat`, and `status` pulses are dropped before `task_start`, `task_complete`, `error`.
2. **Coalesce `status`**: keep only the most recent.
3. **Hard disconnect** at 2× buffer cap with a clear reason in the close frame.

## Shape

```ts
interface ClientQueue {
  connectionId: string;
  buffer: Event[];
  bytesBuffered: number;
  lastFlushMs: number;
  drop_count: number;
}
```

Cap: 256 events or 512 KB, whichever first.

## Detection

A client whose `drop_count` crosses 100 is logged:
```
[SSE] client <id> dropping events (slow connection)
```

Operator dashboards show `sse_clients_slow_total` so sustained degradation surfaces early.

## WebSocket variant

The WebSocket subscription channels (from the Phase-7 plan) already carry per-connection buffer caps. Both SSE and WS consumers share the same `bounded-event-queue` implementation under the hood.

## Non-goals

- No server push to reconnecting clients — once dropped, they resume from the current live stream. Historical events go through /api/logs / /api/tx/:hash not the live channel.
- No per-subscriber rate shaping (e.g., "max 10 events/sec to free-tier clients"). All clients share the same live feed; filtering happens client-side.
