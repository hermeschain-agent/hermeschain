/**
 * Per-opcode gas costs for the Hermes VM. Numbers borrow loosely from
 * EVM pricing so receipts look familiar, but the VM itself is not EVM.
 */
export const GAS_COSTS = {
  PUSH: 3n,
  POP: 2n,
  ADD: 3n,
  SUB: 3n,
  SSTORE: 20000n,
  STOP: 0n,
  REVERT: 0n,
  // LOG has a base cost + per-byte data cost (8 per byte, EVM-style).
  LOG_BASE: 375n,
  LOG_PER_BYTE: 8n,
} as const;

export class GasMeter {
  private remaining: bigint;
  private spent: bigint = 0n;

  constructor(limit: bigint) {
    this.remaining = limit;
  }

  /** Charge `amount`. Returns true if the meter had enough; false if it ran out. */
  charge(amount: bigint): boolean {
    if (amount > this.remaining) {
      this.spent += this.remaining;
      this.remaining = 0n;
      return false;
    }
    this.remaining -= amount;
    this.spent += amount;
    return true;
  }

  getSpent(): bigint {
    return this.spent;
  }

  getRemaining(): bigint {
    return this.remaining;
  }
}

export function logGasCost(dataBytes: number): bigint {
  return GAS_COSTS.LOG_BASE + GAS_COSTS.LOG_PER_BYTE * BigInt(dataBytes);
}
