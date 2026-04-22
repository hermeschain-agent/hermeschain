# Test notes: GasMeter invariants

**Task:** phase-05 / vm-gas / step-4 (cover)
**Target:** `backend/tests/gas-meter.test.ts`

## Invariants

1. Fresh meter has `left() === budget`.
2. `consume('PUSH')` deducts 3 from the budget.
3. Consuming an unknown opcode deducts 1 (safety default).
4. `consume` throws `OutOfGasError` when cost exceeds remaining.
5. Constructor rejects negative or non-integer budget.
6. `refund` accumulates; not applied until `settleRefund`.
7. `settleRefund` caps refund at half of gasUsed.
8. Refund is zero when nothing's consumed.

## Scaffolding

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GasMeter, GAS, OutOfGasError } from '../src/hermes-generated/gas-schedule';

test('fresh meter', () => {
  const m = new GasMeter(1000);
  assert.equal(m.left(), 1000);
});

test('consume known op', () => {
  const m = new GasMeter(100);
  m.consume('PUSH');
  assert.equal(m.left(), 100 - GAS.PUSH);
});

test('consume unknown op defaults to 1', () => {
  const m = new GasMeter(100);
  m.consume('WEIRDOP');
  assert.equal(m.left(), 99);
});

test('out of gas throws', () => {
  const m = new GasMeter(2);
  assert.throws(() => m.consume('SSTORE'), OutOfGasError);
});

test('rejects negative budget', () => {
  assert.throws(() => new GasMeter(-1));
  assert.throws(() => new GasMeter(1.5));
});

test('refund capped at half of used', () => {
  const m = new GasMeter(1000);
  m.consume('PUSH'); m.consume('PUSH'); // used = 6
  m.refund(100);
  const applied = m.settleRefund(1000);
  // cap = floor(6 / 2) = 3
  assert.equal(applied, 3);
  assert.equal(m.left(), (1000 - 6) + 3);
});

test('refund on zero use → zero applied', () => {
  const m = new GasMeter(1000);
  m.refund(500);
  const applied = m.settleRefund(1000);
  assert.equal(applied, 0);
});
```
