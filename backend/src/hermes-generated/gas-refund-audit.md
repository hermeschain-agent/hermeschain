# Gas Refund Audit

**Task:** phase-05 / gas-refunds / step-1 (audit)
**Scope:** `backend/src/vm/`

## Why refunds

When a contract zeroes out a storage slot, the state size goes down. Classic EVM rewards this with a refund — partially offsetting the cost of the SSTORE that set the slot originally. Without refunds, cleaning up state costs the same as allocating, and nobody cleans up.

## Current state

`GasMeter.refund()` exists (from phase-5 gas-schedule), but the call sites are TODO. SSTORE in the interpreter charges full cost and never refunds.

## What triggers a refund

| Op | Condition | Refund |
| --- | --- | --- |
| `SSTORE` | value = 0 and previous != 0 | 4800 |
| `SELFDESTRUCT` | always | 24000 |

Both values match post-EIP-3529 scaled-down EVM conventions. Pre-EIP-3529 refunds were 2x this; scaling down prevents refund-farming attacks where contracts arbitrarily fill-and-clear to effectively execute at negative gas.

## Cap

Refund applied at transaction end is capped at `used / 5` (20% of gas used). Also from EIP-3529. Protects against the same attack class.

## Execution order

```
1. Run the tx. GasMeter consumes per opcode. refund() calls stage amounts into refundBucket.
2. At tx completion, settleRefund(initialBudget) applies min(refundBucket, used/5).
3. Record gasUsed = initialBudget - meter.left() in the receipt (after refund application).
```

## Wiring

Interpreter's SSTORE handler:

```ts
case 'SSTORE': {
  const [slot, value] = [stack.pop(), stack.pop()];
  const prev = storage.get(slot);
  storage.put(slot, value);
  if (isZero(value) && !isZero(prev)) {
    gasMeter.refund(4800);
  }
  // cost was already consumed at dispatch
  break;
}
```

`SELFDESTRUCT` analogous, one unconditional refund on execute.

## Observability

Per-tx receipt gains (forward-compat) `refundApplied` field. Operators can track the ratio of (refund-eligible storage writes) / (refunded-at-cap) to tune the cap.
