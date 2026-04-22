# Test notes: Merkle Patricia Trie invariants

**Task:** phase-03 / state-trie / step-4 (cover)
**Target:** `backend/tests/mpt.test.ts`

## Invariants (core types + algo)

1. `toNibbles([0xab])` → `[0xa, 0xb]` (hi-nibble first).
2. `commonPrefixLength([1,2,3], [1,2,4])` → 2.
3. `commonPrefixLength([1,2], [1,2,3])` → 2 (bounded by shorter).
4. `isPrefix([1,2], [1,2,3])` → true; `isPrefix([1,3], [1,2,3])` → false.
5. `emptyBranch()` has 16 null children and null value.

## Invariants (algo, once implementation lands)

6. `put(k, v) → get(k) === v`.
7. Two puts with different keys preserve both values.
8. Two puts with the same key overwrite.
9. `delete(k)` followed by `get(k)` returns null.
10. Empty trie has a deterministic sentinel root (`'EMPTY'` or zero-hash).
11. Same set of puts in different orders → identical rootHash (commutativity).
12. Proof produced by `prove(k)` verifies against `rootHash()` for value `get(k)`.
13. Tampered proof (single-byte flip) fails verification.

## Scaffolding (core only, in scope for this commit)

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toNibbles,
  commonPrefixLength,
  isPrefix,
  emptyBranch,
} from '../src/hermes-generated/mpt-core-types';

test('toNibbles splits hi-then-lo', () => {
  assert.deepEqual(toNibbles(Uint8Array.from([0xab])), [0xa, 0xb]);
  assert.deepEqual(toNibbles(Uint8Array.from([0x00, 0xff])), [0, 0, 0xf, 0xf]);
});

test('commonPrefixLength bounded by shorter', () => {
  assert.equal(commonPrefixLength([1, 2, 3], [1, 2]), 2);
  assert.equal(commonPrefixLength([1, 2], [1, 2, 3]), 2);
  assert.equal(commonPrefixLength([], [1]), 0);
});

test('isPrefix', () => {
  assert.equal(isPrefix([1, 2], [1, 2, 3]), true);
  assert.equal(isPrefix([1, 3], [1, 2, 3]), false);
  assert.equal(isPrefix([1, 2, 3, 4], [1, 2, 3]), false);
});

test('emptyBranch structure', () => {
  const b = emptyBranch();
  assert.equal(b.kind, 'branch');
  assert.equal(b.children.length, 16);
  for (const c of b.children) assert.equal(c, null);
  assert.equal(b.value, null);
});
```

Algo-level tests (invariants 6-13) follow in the separate implementation module.
