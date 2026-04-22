/**
 * Typed GasSchedule + GasMeter.
 *
 * Phase-5 / vm-gas / step-2. A GasMeter instance is one-per-execution;
 * consume() throws OutOfGas when the budget depletes. Unknown opcodes
 * fall back to cost 1 so a dictionary gap defaults to "mildly costly",
 * not "free".
 */

export class OutOfGasError extends Error {
  constructor(public readonly op: string, public readonly need: number, public readonly have: number) {
    super(`out of gas: op=${op} need=${need} have=${have}`);
    this.name = 'OutOfGasError';
  }
}

export const GAS: Readonly<Record<string, number>> = Object.freeze({
  // Stack
  PUSH: 3, POP: 2, DUP: 3, SWAP: 3,
  // Arithmetic
  ADD: 3, SUB: 3, MUL: 5, DIV: 5, MOD: 5, EXP: 10,
  // Comparison / bitwise
  LT: 3, GT: 3, EQ: 3, ISZERO: 3, AND: 3, OR: 3, XOR: 3, NOT: 3,
  // Crypto
  KECCAK256: 30, SHA256: 60, ED25519_VERIFY: 3000,
  // Storage
  SLOAD: 800, SSTORE: 20_000, SSTORE_SET: 20_000, SSTORE_RESET: 5_000,
  // Memory
  MLOAD: 3, MSTORE: 3, MSTORE8: 3,
  // Control flow
  JUMP: 8, JUMPI: 10, JUMPDEST: 1,
  // Calls
  CALL: 700, STATICCALL: 700, DELEGATECALL: 700, CREATE: 32_000,
  // Termination
  RETURN: 0, REVERT: 0, STOP: 0, SELFDESTRUCT: 5_000,
  // Logs
  LOG0: 375, LOG1: 750, LOG2: 1_125, LOG3: 1_500, LOG4: 1_875,
});

export class GasMeter {
  private remaining: number;
  private refundBucket = 0;

  constructor(budget: number) {
    if (!Number.isInteger(budget) || budget < 0) {
      throw new Error('gas: budget must be non-negative integer');
    }
    this.remaining = budget;
  }

  consume(op: string): void {
    const cost = GAS[op] ?? 1;
    if (cost > this.remaining) {
      throw new OutOfGasError(op, cost, this.remaining);
    }
    this.remaining -= cost;
  }

  refund(amount: number): void {
    if (amount < 0) throw new Error('gas: refund must be non-negative');
    this.refundBucket += amount;
  }

  left(): number {
    return this.remaining;
  }

  /** Refunds are capped at half of gasUsed (EVM convention). */
  settleRefund(initialBudget: number): number {
    const used = initialBudget - this.remaining;
    const cap = Math.floor(used / 2);
    const applied = Math.min(this.refundBucket, cap);
    this.remaining += applied;
    this.refundBucket = 0;
    return applied;
  }
}
