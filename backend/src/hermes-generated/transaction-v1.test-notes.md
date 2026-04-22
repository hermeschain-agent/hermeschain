# Test notes: TransactionV1 invariants

**Task:** phase-02 / tx-schema / step-4 (cover)
**Target:** `backend/tests/transaction-v1.test.ts`

## Invariants

1. `validatePayload` accepts a fully-valid payload.
2. Rejects `version !== 1`.
3. Rejects missing/blank `chainId`.
4. Rejects `from`/`to` that aren't ETH-hex or base58.
5. Rejects `amount`/`gasLimit`/`gasPrice` that aren't unsigned integer strings.
6. Rejects negative or non-integer `nonce`.
7. Rejects `validBefore <= validAfter`.
8. Rejects non-hex `data`.
9. `toSignablePayload` drops `signature` and `hash` and fills `data: ''` if absent.

## Scaffolding

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePayload, toSignablePayload } from '../src/hermes-generated/transaction-v1-record';

const base = {
  version: 1 as const,
  chainId: 'hermeschain-testnet',
  from: '0x' + 'a'.repeat(40),
  to:   '0x' + 'b'.repeat(40),
  amount: '1000',
  gasLimit: '21000',
  gasPrice: '1',
  nonce: 0,
  validAfterTimestampMs: 1,
  validBeforeTimestampMs: 2,
  data: '',
};

test('accepts valid payload', () => {
  assert.doesNotThrow(() => validatePayload(base));
});

test('rejects version != 1', () => {
  assert.throws(() => validatePayload({ ...base, version: 2 as any }));
});

test('rejects blank chainId', () => {
  assert.throws(() => validatePayload({ ...base, chainId: '' }));
});

test('rejects bad from/to', () => {
  assert.throws(() => validatePayload({ ...base, from: 'not-an-address' }));
  assert.throws(() => validatePayload({ ...base, to: '0xZZ' }));
});

test('rejects non-integer string amount', () => {
  assert.throws(() => validatePayload({ ...base, amount: '-1' }));
  assert.throws(() => validatePayload({ ...base, amount: '1.5' }));
});

test('rejects negative nonce', () => {
  assert.throws(() => validatePayload({ ...base, nonce: -1 }));
  assert.throws(() => validatePayload({ ...base, nonce: 1.5 }));
});

test('rejects validBefore <= validAfter', () => {
  assert.throws(() => validatePayload({ ...base, validAfterTimestampMs: 5, validBeforeTimestampMs: 5 }));
});

test('rejects non-hex data', () => {
  assert.throws(() => validatePayload({ ...base, data: 'not hex' }));
});

test('toSignablePayload drops sig + hash', () => {
  const withExtras = { ...base, signature: 'sig', hash: 'h' };
  const signable = toSignablePayload(withExtras as any);
  assert.equal('signature' in signable, false);
  assert.equal('hash' in signable, false);
});
```
