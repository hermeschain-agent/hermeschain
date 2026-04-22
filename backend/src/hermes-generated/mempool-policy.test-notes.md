# Test notes: MempoolPolicy invariants

**Task:** phase-02 / mempool-rules / step-4 (cover)
**Target:** `backend/tests/mempool-policy.test.ts`

## Invariants

1. Defaults hold — empty input produces the documented defaults.
2. `maxPerSender > maxSize` throws (cross-field).
3. `maxSize < 1`, `maxPerSender < 1`, `ttlMs < 1000` all throw.
4. Bad `orderBy` / `onFull` strings throw.
5. Returned policy is frozen.
6. `isStale` returns true iff `now - firstSeen > ttlMs`.
7. `isStale` with `now === firstSeen + ttlMs` returns false (not-yet-stale on the boundary).

## Scaffolding

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMempoolPolicy, isStale } from '../src/hermes-generated/mempool-policy';

test('defaults', () => {
  const p = makeMempoolPolicy();
  assert.equal(p.maxSize, 10_000);
  assert.equal(p.maxPerSender, 32);
  assert.equal(p.ttlMs, 120_000);
  assert.equal(p.orderBy, 'gasPrice');
  assert.equal(p.onFull, 'drop-lowest-fee');
});

test('rejects maxPerSender > maxSize', () => {
  assert.throws(() => makeMempoolPolicy({ maxSize: 10, maxPerSender: 100 }));
});

test('rejects sub-minimums', () => {
  assert.throws(() => makeMempoolPolicy({ maxSize: 0 }));
  assert.throws(() => makeMempoolPolicy({ maxPerSender: 0 }));
  assert.throws(() => makeMempoolPolicy({ ttlMs: 500 }));
});

test('rejects unknown enum strings', () => {
  assert.throws(() => makeMempoolPolicy({ orderBy: 'random' as any }));
  assert.throws(() => makeMempoolPolicy({ onFull: 'wat' as any }));
});

test('frozen', () => {
  const p = makeMempoolPolicy();
  assert.throws(() => { (p as any).maxSize = 1; });
});

test('isStale boundary', () => {
  const p = makeMempoolPolicy({ ttlMs: 1000 });
  assert.equal(isStale(1000, p, 1000), false);
  assert.equal(isStale(1000, p, 2000), false);
  assert.equal(isStale(1000, p, 2001), true);
});
```
