# Audit: VM Gas Metering

**Task:** phase-05 / vm-gas / step-1 (audit)
**Scope:** `backend/src/vm/`

## Problem

Hermeschain's VM runs contract bytecode without a gas meter. A contract can loop forever and block all other tx processing in the block. Any adversarial contract DoSes the chain.

## What exists today

- `Interpreter.ts` dispatches opcodes via a switch statement.
- Each opcode handler runs its own logic and returns, no cost tracking.
- Transactions don't carry a `gasLimit` / `gasPrice` (fixed in phase-2 tx-schema work).

## What's needed

1. Per-opcode gas cost table (`GAS[opcode]`).
2. `GasMeter` that deducts on each opcode and throws on `out of gas`.
3. Contract-call gas pass-through: a CALL opcode subtracts its own cost and passes remaining budget to the callee, which returns unused gas on return.
4. Refund rules (SSTORE zero-out is traditionally refunded).

## Step-2 contract

```ts
class GasMeter {
  constructor(budget: number);
  consume(op: string): void;
  refund(amount: number): void;
  left(): number;
}

export const GAS: Record<string, number> = {
  PUSH: 3, POP: 2,
  ADD: 3, MUL: 5, DIV: 5, MOD: 5,
  SLOAD: 800, SSTORE: 20_000,
  KECCAK256: 30, SHA256: 60,
  CALL: 700, RETURN: 0,
  REVERT: 0, STOP: 0,
  JUMP: 8, JUMPI: 10,
};
```

Values loosely follow EVM's schedule — well-understood gas economics for storage-heavy ops (SSTORE) dominating arithmetic.

## Wiring outline

`Interpreter.execute(op, ctx)` becomes:
```
ctx.gas.consume(op);      // throws → VM halts with 'out of gas'
switch (op) { ... }        // opcode handler runs
```

`CALL` allocates a child `GasMeter` with the specified budget and catches out-of-gas / revert to propagate.

## Receipt integration

`TransactionReceipt.gasUsed` = `initialBudget - meter.left()`. Already in the receipt struct from Phase-2.
