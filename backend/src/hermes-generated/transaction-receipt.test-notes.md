# Test notes: TransactionReceipt invariants

**Task:** phase-02 / tx-receipts / step-4 (cover)
**Target:** `backend/tests/transaction-receipt.test.ts`

## Invariants

1. Accepts a fully-valid success receipt.
2. Rejects missing txHash.
3. Rejects negative blockHeight / txIndex.
4. Rejects non-unsigned-integer gas strings.
5. Rejects `revertReason` on a success receipt.
6. Accepts `revertReason` on a reverted receipt.
7. Accepts empty logs[].
8. Rejects non-hex event fields.
9. Deep-frozen (mutating logs[0].topics throws).

## Scaffolding

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeReceipt } from '../src/hermes-generated/transaction-receipt';

const base = {
  txHash: 'h',
  blockHeight: 100,
  txIndex: 0,
  status: 'success' as const,
  gasUsed: '21000',
  effectiveGasPrice: '2',
  cumulativeGasUsed: '21000',
};

test('accepts valid success receipt', () => {
  assert.doesNotThrow(() => makeReceipt(base));
});

test('rejects missing txHash', () => {
  assert.throws(() => makeReceipt({ ...base, txHash: '' }));
});

test('rejects negative blockHeight', () => {
  assert.throws(() => makeReceipt({ ...base, blockHeight: -1 }));
});

test('rejects non-integer gas string', () => {
  assert.throws(() => makeReceipt({ ...base, gasUsed: '-10' }));
  assert.throws(() => makeReceipt({ ...base, gasUsed: '10.5' }));
  assert.throws(() => makeReceipt({ ...base, effectiveGasPrice: 'abc' }));
});

test('rejects revertReason on success', () => {
  assert.throws(() => makeReceipt({ ...base, revertReason: 'wat' }));
});

test('accepts revertReason on reverted', () => {
  const r = makeReceipt({ ...base, status: 'reverted', revertReason: 'underflow' });
  assert.equal(r.revertReason, 'underflow');
});

test('rejects non-hex event fields', () => {
  assert.throws(() =>
    makeReceipt({
      ...base,
      logs: [{ address: 'not-hex', topics: [], data: '0x' }],
    }),
  );
});

test('deep frozen', () => {
  const r = makeReceipt({
    ...base,
    logs: [{ address: '0xabcd', topics: ['0x01'], data: '0x' }],
  });
  assert.throws(() => { (r.logs[0] as any).data = '0xff'; });
  assert.throws(() => { (r.logs[0].topics as any).push('0x02'); });
});
```
