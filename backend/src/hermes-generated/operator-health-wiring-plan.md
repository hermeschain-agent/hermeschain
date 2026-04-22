# Wiring plan: OperatorHealth into /api/agent/status

**Task:** foundation / operator-health / step-3 (wire canonical)
**Depends on:** [operator-health-record.ts](operator-health-record.ts)

## New API surface

Add a `health: OperatorHealth` field to `buildAgentStatusPayload()` in `backend/src/api/server.ts`. The existing flat fields stay for one release, then migrate.

```ts
const health = makeOperatorHealth({
  chain: {
    height: chain.getChainLength(),
    lastBlockTimestampMs: chain.getLatestBlock()?.header.timestamp ?? null,
    secondsSinceLastBlock: /* Math.floor((Date.now() - lastTs) / 1000) */,
    finalityDepth: finalityTracker.finalityHeight(chain.getChainLength()),
  },
  mempool: {
    pending: txPool.size(),
    oldestAgeMs: txPool.oldestAgeMs(),
  },
  validators: validatorManager.listWithLiveness().map((v) => ({
    address: v.address,
    online: v.online,
    lastSeenMs: v.lastSeenMs,
  })),
  agent: {
    heartbeatAgeMs: Date.now() - state.lastHeartbeat,
    tokenSpendHour: budget.snapshot().hour,
    tokenSpendDay: budget.snapshot().day,
    blockedReason: state.blockedReason,
    lastFailure: state.lastFailure,
  },
});
```

## New helpers to add

- `TransactionPool.oldestAgeMs()` — returns `Date.now() - oldestPending.receivedAt`.
- `ValidatorManager.listWithLiveness()` — joins the validator set with the last-seen timestamp from the heartbeat subsystem.

## Frontend consumption

The existing landing rail already consumes `/api/agent/status`. Add a small "OPS" section to the agent terminal (or admin page) that reads `response.health`:

- `chainStale(health, 30) → red` if true
- `anyValidatorOffline(health) → amber` if true
- `health.mempool.pending > 200 → amber`
- otherwise green

Render via the existing status-pill pattern.
