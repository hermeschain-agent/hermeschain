# Hermes VM Specification

JSON-op interpreter. Programs are arrays of `{op: string, args?: any}` objects encoded as the data field of a tx prefixed with `vm:`.

## Opcodes

Stack ops: PUSH, POP, ADD, SUB, MUL, DIV, MOD
Comparisons: EQ, LT, GT
Bitwise: AND, OR, NOT
Storage: SSTORE, SLOAD
Logging: LOG
Control: STOP, REVERT

See per-opcode docs in /docs/vm/opcodes/.

## Gas costs

See [GasMeter.ts](../../backend/src/vm/GasMeter.ts).

## Examples

See /examples/counter, erc20-like (planned), multisig (planned).
