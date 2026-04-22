# Test notes: canonicalEncode invariants

**Task:** foundation / serialization / step-4 (cover)
**Target:** `backend/tests/canonical-encode.test.ts`

## Invariants

1. **Key-permutation stability.** `{a:1,b:2}` and `{b:2,a:1}` encode to identical bytes.
2. **Array order preserved.** `[1,2,3]` ≠ `[3,2,1]`.
3. **BigInt round-trip.** A BigInt survives encode → decode → re-encode with identical bytes.
4. **Buffer hex encoding.** `Buffer.from([0xab,0xcd])` encodes as `"hex:abcd"`.
5. **Rejects undefined at root.** `canonicalEncode(undefined)` throws.
6. **Drops undefined inside objects.** `{a:1,b:undefined}` encodes the same as `{a:1}`.
7. **Rejects NaN/Infinity.** Non-finite numbers throw.

## Scaffolding

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalEncode } from '../src/hermes-generated/canonical-encode';

test('key permutation stable', () => {
  const a = canonicalEncode({ a: 1, b: 2 });
  const b = canonicalEncode({ b: 2, a: 1 });
  assert.deepEqual(a, b);
});

test('array order matters', () => {
  assert.notDeepEqual(canonicalEncode([1, 2, 3]), canonicalEncode([3, 2, 1]));
});

test('bigint encoded deterministically', () => {
  const huge = 12345678901234567890n;
  const a = canonicalEncode({ v: huge }).toString('utf8');
  assert.ok(a.includes(`"bigint:${huge.toString(10)}"`));
});

test('buffer encoded as hex sentinel', () => {
  const v = canonicalEncode({ b: Buffer.from([0xab, 0xcd]) }).toString('utf8');
  assert.ok(v.includes('"hex:abcd"'));
});

test('rejects undefined at root', () => {
  assert.throws(() => canonicalEncode(undefined));
});

test('drops undefined inside objects', () => {
  assert.deepEqual(
    canonicalEncode({ a: 1, b: undefined }),
    canonicalEncode({ a: 1 }),
  );
});

test('rejects non-finite numbers', () => {
  assert.throws(() => canonicalEncode({ v: NaN }));
  assert.throws(() => canonicalEncode({ v: Infinity }));
});
```
