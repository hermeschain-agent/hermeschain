# Test notes: FinalityTracker invariants

**Task:** phase-04 / finality / step-4 (cover)
**Target:** `backend/tests/finality-tracker.test.ts`

## Invariants

1. Fresh tracker reports `finalityHeight === -1` before `depth` blocks observed.
2. After exactly `depth` blocks, first block is not yet finalized.
3. After `depth + 1` blocks, block 0 is finalized.
4. `observe` returns the newly-finalized block; null until crossing the threshold.
5. Duplicate / out-of-order observation is ignored (returns null, doesn't advance head).
6. `rewindTo(n)` drops blocks > n and snaps head back; finalizedHeight recomputes.
7. Constructor rejects zero and negative depth.

## Scaffolding

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FinalityTracker } from '../src/hermes-generated/finality-tracker';

const mk = (h: number) => ({ height: h, hash: `h${h}`, timestamp: h * 1000 });

test('fresh tracker: finalityHeight -1', () => {
  const t = new FinalityTracker(4);
  assert.equal(t.snapshot().finalizedHeight, -1);
});

test('no finality before depth + 1 blocks', () => {
  const t = new FinalityTracker(4);
  for (let i = 0; i < 4; i += 1) {
    assert.equal(t.observe(mk(i)), null);
  }
  // head at 3, needs head >= depth (4) for finalization
  assert.equal(t.snapshot().finalizedHeight, -1);
});

test('block 0 finalized after depth + 1 observations', () => {
  const t = new FinalityTracker(4);
  for (let i = 0; i < 5; i += 1) t.observe(mk(i));
  // head 4, depth 4 → finalizedHeight 0
  assert.equal(t.snapshot().finalizedHeight, 0);
  assert.equal(t.isFinalized(0), true);
  assert.equal(t.isFinalized(1), false);
});

test('observe returns newly-finalized block', () => {
  const t = new FinalityTracker(2);
  assert.equal(t.observe(mk(0)), null);
  assert.equal(t.observe(mk(1)), null);
  const finalized = t.observe(mk(2));
  assert.equal(finalized?.height, 0);
});

test('out-of-order observation ignored', () => {
  const t = new FinalityTracker(4);
  t.observe(mk(5));
  const r = t.observe(mk(3));
  assert.equal(r, null);
  assert.equal(t.snapshot().head, 5);
});

test('rewindTo drops past-target blocks', () => {
  const t = new FinalityTracker(2);
  for (let i = 0; i < 6; i += 1) t.observe(mk(i));
  assert.equal(t.snapshot().head, 5);
  t.rewindTo(3);
  assert.equal(t.snapshot().head, 3);
});

test('rejects sub-1 depth', () => {
  assert.throws(() => new FinalityTracker(0));
  assert.throws(() => new FinalityTracker(-1));
});
```
