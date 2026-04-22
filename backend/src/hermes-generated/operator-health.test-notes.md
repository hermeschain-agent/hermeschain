# Test notes: OperatorHealth invariants

**Task:** foundation / operator-health / step-4 (cover)
**Target:** `backend/tests/operator-health.test.ts`

## Invariants

1. Deep freeze — mutating `.chain`, `.mempool`, `.validators[0]`, or `.agent` throws.
2. `chainStale(health, 30)` returns true iff `secondsSinceLastBlock > 30`.
3. `chainStale` returns false when `secondsSinceLastBlock` is null (chain hasn't produced a block yet).
4. `anyValidatorOffline` returns true iff at least one validator has `online: false`.
5. Empty validator list → `anyValidatorOffline` returns false (vacuous truth).

## Scaffolding

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeOperatorHealth,
  chainStale,
  anyValidatorOffline,
} from '../src/hermes-generated/operator-health-record';

const baseChain = { height: 10, lastBlockTimestampMs: 0, secondsSinceLastBlock: 5, finalityDepth: 0 };
const baseMempool = { pending: 0, oldestAgeMs: null };
const baseAgent = {
  heartbeatAgeMs: 1000,
  tokenSpendHour: 0,
  tokenSpendDay: 0,
  blockedReason: null,
  lastFailure: null,
};

test('deep frozen', () => {
  const h = makeOperatorHealth({
    chain: baseChain,
    mempool: baseMempool,
    validators: [{ address: '0xaaa', online: true, lastSeenMs: 0 }],
    agent: baseAgent,
  });
  assert.throws(() => { (h.chain as any).height = 99; });
  assert.throws(() => { (h.validators as any).push({}); });
  assert.throws(() => { (h.validators[0] as any).online = false; });
});

test('chainStale honors threshold', () => {
  const fresh = makeOperatorHealth({ chain: { ...baseChain, secondsSinceLastBlock: 5 }, mempool: baseMempool, validators: [], agent: baseAgent });
  const stale = makeOperatorHealth({ chain: { ...baseChain, secondsSinceLastBlock: 120 }, mempool: baseMempool, validators: [], agent: baseAgent });
  assert.equal(chainStale(fresh, 60), false);
  assert.equal(chainStale(stale, 60), true);
});

test('chainStale false when no block yet', () => {
  const empty = makeOperatorHealth({ chain: { ...baseChain, secondsSinceLastBlock: null }, mempool: baseMempool, validators: [], agent: baseAgent });
  assert.equal(chainStale(empty, 60), false);
});

test('anyValidatorOffline detects offline', () => {
  const h = makeOperatorHealth({
    chain: baseChain,
    mempool: baseMempool,
    validators: [
      { address: '0xaaa', online: true, lastSeenMs: 0 },
      { address: '0xbbb', online: false, lastSeenMs: null },
    ],
    agent: baseAgent,
  });
  assert.equal(anyValidatorOffline(h), true);
});

test('anyValidatorOffline empty list', () => {
  const h = makeOperatorHealth({ chain: baseChain, mempool: baseMempool, validators: [], agent: baseAgent });
  assert.equal(anyValidatorOffline(h), false);
});
```
