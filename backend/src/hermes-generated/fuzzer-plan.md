# Fuzzer Plan

**Task:** phase-08 / fuzzer / step-1 (design)
**Scope:** `backend/tests/fuzz/`

## Targets

1. **canonicalEncode** — random object trees; property: encode(X) === encode(permute_keys(X)).
2. **TransactionV1 roundtrip** — random valid payloads; property: encode → decode returns an equal payload.
3. **NonceWindow** — random accept sequences; property: final expected is never lower than the max-accepted nonce + 1, never higher than initial + sequence length.
4. **MerklePatricia put/get** — random KV pairs; property: every inserted value is retrievable, and the rootHash is permutation-invariant.
5. **MempoolPolicy admit/evict** — random tx streams with capacity bounds; property: pool never exceeds maxSize; per-sender cap never exceeded.

## Runner

Use `fast-check` (npm). Minimal boilerplate:

```ts
import { test } from 'node:test';
import fc from 'fast-check';
import { canonicalEncode } from '../src/hermes-generated/canonical-encode';

test('canonicalEncode is permutation-invariant', () => {
  fc.assert(
    fc.property(fc.object(), (obj) => {
      const encoded = canonicalEncode(obj).toString('utf8');
      const shuffled = Object.fromEntries(
        Object.entries(obj).sort(() => Math.random() - 0.5),
      );
      return encoded === canonicalEncode(shuffled).toString('utf8');
    }),
    { numRuns: 500 },
  );
});
```

## CI integration

Fuzz tests run on every PR with `numRuns: 500`. Nightly job runs with `numRuns: 50_000` against `main`. Regressions get filed as bugs referencing the minimized input fast-check produces.

## Failure artifact

When a fuzz run fails, fast-check automatically shrinks the input to the minimum reproducer. Capture that reproducer as a fixed-input regression test under `backend/tests/regressions/`. Every reported bug becomes a permanent regression guard.

## Non-goals

- No cross-process fuzzing (only pure functions for now).
- No concurrency / TOCTOU fuzzing — out of scope until we have concurrent state mutation paths.
