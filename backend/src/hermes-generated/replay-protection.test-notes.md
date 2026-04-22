# Test notes: Replay protection invariants

**Task:** phase-02 / replay-protection / step-4 (cover)
**Target:** `backend/tests/replay-protection.test.ts`

## NonceWindow invariants

1. Fresh window at expected=0 accepts 0 and advances to 1.
2. Rejects negative expected and zero window in constructor.
3. Nonce below expected → `'stale'`, never `'accept'`.
4. Nonce at exactly expected → `'accept'`.
5. Nonce in future window → `'future'`, doesn't advance expected.
6. Nonce at or past `expected + window` → `'stale'`.
7. After a future nonce, admitting the intermediate one auto-advances expected.
8. `rewind(n)` resets expected and drops future entries past n.

## SeenTxSet invariants

1. `has()` returns false before `remember()`, true after.
2. `remember` is idempotent — calling twice doesn't double-count.
3. Evicts oldest entry when capacity is exceeded.
4. `chainIdHash` isolates: same txHash under different chains is tracked separately.
5. `rewindTo(h)` drops entries whose firstSeenHeight > h.

## Scaffolding (NonceWindow)

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NonceWindow } from '../src/hermes-generated/nonce-window';

test('accepts 0 then advances', () => {
  const w = new NonceWindow(0, 4);
  assert.equal(w.admit(0), 'accept');
  assert.equal(w.snapshot().expected, 1);
});

test('rejects stale', () => {
  const w = new NonceWindow(5, 4);
  assert.equal(w.decide(3), 'stale');
});

test('future then intermediate auto-advances', () => {
  const w = new NonceWindow(0, 4);
  assert.equal(w.admit(2), 'future');
  assert.equal(w.admit(0), 'accept');
  // After 0 → expected=1; 1 still unseen so no further advance
  assert.equal(w.snapshot().expected, 1);
  assert.equal(w.admit(1), 'accept');
  // Now 1→2 auto-advances because 2 is buffered
  assert.equal(w.snapshot().expected, 3);
});

test('past window → stale', () => {
  const w = new NonceWindow(0, 4);
  assert.equal(w.decide(4), 'stale');
});

test('rewind clears past-target futures', () => {
  const w = new NonceWindow(0, 8);
  w.admit(3); // future
  w.rewind(5);
  // 3 should be dropped; admit 5 still works
  assert.equal(w.admit(5), 'accept');
});
```

## Scaffolding (SeenTxSet)

```ts
import { SeenTxSet } from '../src/hermes-generated/seen-tx-set';

test('remember is idempotent', () => {
  const s = new SeenTxSet(10);
  s.remember({ txHash: 'a', chainIdHash: 'c', firstSeenHeight: 1, firstSeenMs: 0 });
  s.remember({ txHash: 'a', chainIdHash: 'c', firstSeenHeight: 2, firstSeenMs: 0 });
  assert.equal(s.size(), 1);
});

test('evicts oldest on capacity breach', () => {
  const s = new SeenTxSet(2);
  s.remember({ txHash: 'a', chainIdHash: 'c', firstSeenHeight: 1, firstSeenMs: 0 });
  s.remember({ txHash: 'b', chainIdHash: 'c', firstSeenHeight: 2, firstSeenMs: 0 });
  s.remember({ txHash: 'c', chainIdHash: 'c', firstSeenHeight: 3, firstSeenMs: 0 });
  assert.equal(s.has('c', 'a'), false);
  assert.equal(s.has('c', 'b'), true);
});

test('chainIdHash isolates', () => {
  const s = new SeenTxSet(10);
  s.remember({ txHash: 'a', chainIdHash: 'c1', firstSeenHeight: 1, firstSeenMs: 0 });
  assert.equal(s.has('c2', 'a'), false);
});
```
