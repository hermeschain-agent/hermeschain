# Audit: Operator Health Surfaces

**Task:** foundation / operator-health / step-1 (audit)
**Scope:** `backend/src/api/`, `backend/src/blockchain/`

## What operators need to see

An on-call operator opening `/api/agent/status` should be able to answer in one read:
- Is the chain advancing? (block height + last block timestamp)
- Is consensus healthy? (finality depth, validators online)
- Is the mempool clean? (pending tx count, oldest pending)
- Is the agent alive? (heartbeat, token spend)
- What's wrong? (blocked reason, last failure)

## Current surfaces

| Field | Present | Gap |
| --- | --- | --- |
| `blockHeight` | ✓ | — |
| `lastBlockTimestamp` | ✓ | — |
| finality depth | ✗ | no `FinalityTracker` wired to status |
| validators online | ✗ | `ValidatorManager` has no liveness probe |
| pending tx count | ✗ | `TransactionPool.size()` not on status |
| oldest pending | ✗ | not tracked at all |
| agent heartbeat | ✓ | — |
| token spend | ✓ (new) | — |
| blocked reason | ✓ | sometimes `null` when it should say "waiting for peers" |
| last failure | ✓ | — |

## Drift

- **Mempool is invisible.** An operator seeing `blockHeight: 382_585` but a 500-tx pending backlog has no way to know without reading logs.
- **Validator liveness is absent.** A single-operator chain won't notice, but any multi-validator deployment needs "2 of 3 online" visibility.
- **Blocked reason goes stale.** When the worker pauses for the commit window, `blockedReason` stays from the previous cycle.

## Step-2 contract

`OperatorHealth`:
```
interface OperatorHealth {
  chain:     { height, lastBlockTimestampMs, secondsSinceLastBlock, finalityDepth };
  mempool:   { pending, oldestAgeMs };
  validators: Array<{ address, online, lastSeenMs }>;
  agent:     { heartbeatAgeMs, tokenSpend, blockedReason, lastFailure };
}
```

One call to `collectOperatorHealth()` populates it. Step-3 wires it into `/api/agent/status` as a nested field.
