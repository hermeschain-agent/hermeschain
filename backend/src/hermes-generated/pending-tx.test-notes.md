# Test notes: pending-tx visibility invariants

**Task:** phase-02 / pending-visibility / step-4 (cover)
**Target:** `backend/tests/pending-tx.test.ts`

## Invariants

1. `summarizePendingTx` drops signature + publicKey + data, preserves hash + amounts + ageMs + sizeBytes.
2. `ageMs` is never negative (clock skew defense).
3. `sizeBytes` matches `canonicalEncode(tx).length`.
4. `deriveStatus` returns `'pending'` when inMempool and no inclusion.
5. `deriveStatus` returns `'included'` when includedInBlock set but not enough depth.
6. `deriveStatus` returns `'finalized'` at exactly `currentHeight - included >= finalityDepth`.
7. `deriveStatus` returns `'failed'` when failureReason is set, even if inMempool is true.
8. `deriveStatus` returns `'unknown'` for a tx not in mempool and not included.

## Scaffolding

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizePendingTx, deriveStatus } from '../src/hermes-generated/pending-tx-summary';

const sampleTx = {
  version: 1 as const,
  chainId: 'hermeschain-testnet',
  from: '0x' + 'a'.repeat(40),
  to:   '0x' + 'b'.repeat(40),
  amount: '1000',
  gasLimit: '21000',
  gasPrice: '2',
  nonce: 3,
  validAfterTimestampMs: 1,
  validBeforeTimestampMs: 1000,
  data: '',
  signature: { scheme: 'ed25519', publicKey: 'p', signature: 's' } as any,
  hash: 'h',
};

test('summary drops signature', () => {
  const s = summarizePendingTx(sampleTx as any, 0);
  assert.equal('signature' in s, false);
  assert.equal('publicKey' in s, false);
  assert.equal(s.hash, 'h');
  assert.equal(s.gasPrice, '2');
});

test('ageMs never negative', () => {
  const s = summarizePendingTx(sampleTx as any, 10_000, 5_000); // clock went backwards
  assert.equal(s.ageMs, 0);
});

test('status pending', () => {
  const r = deriveStatus({
    hash: 'h', inMempool: true, includedInBlock: null,
    currentHeight: 10, finalityDepth: 32,
  });
  assert.equal(r.status, 'pending');
});

test('status included vs finalized at the boundary', () => {
  const justIncluded = deriveStatus({
    hash: 'h', inMempool: false, includedInBlock: 100,
    currentHeight: 131, finalityDepth: 32,
  });
  const atBoundary = deriveStatus({
    hash: 'h', inMempool: false, includedInBlock: 100,
    currentHeight: 132, finalityDepth: 32,
  });
  assert.equal(justIncluded.status, 'included');
  assert.equal(atBoundary.status, 'finalized');
});

test('failureReason forces failed', () => {
  const r = deriveStatus({
    hash: 'h', inMempool: true, includedInBlock: null,
    currentHeight: 10, finalityDepth: 32, failureReason: 'invalid nonce',
  });
  assert.equal(r.status, 'failed');
});

test('unknown when nowhere', () => {
  const r = deriveStatus({
    hash: 'h', inMempool: false, includedInBlock: null,
    currentHeight: 10, finalityDepth: 32,
  });
  assert.equal(r.status, 'unknown');
});
```
