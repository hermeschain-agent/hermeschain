/**
 * Per-opcode gas costs for the Hermes VM. Numbers borrow loosely from
 * EVM pricing so receipts look familiar, but the VM itself is not EVM.
 */
export declare const GAS_COSTS: {
    readonly PUSH: 3n;
    readonly POP: 2n;
    readonly ADD: 3n;
    readonly SUB: 3n;
    readonly MUL: 5n;
    readonly DIV: 5n;
    readonly MOD: 5n;
    readonly EQ: 3n;
    readonly LT: 3n;
    readonly GT: 3n;
    readonly AND: 3n;
    readonly OR: 3n;
    readonly NOT: 3n;
    readonly SSTORE: 20000n;
    readonly STOP: 0n;
    readonly REVERT: 0n;
    readonly LOG_BASE: 375n;
    readonly LOG_PER_BYTE: 8n;
};
export declare class GasMeter {
    private remaining;
    private spent;
    constructor(limit: bigint);
    /** Charge `amount`. Returns true if the meter had enough; false if it ran out. */
    charge(amount: bigint): boolean;
    getSpent(): bigint;
    getRemaining(): bigint;
}
export declare function logGasCost(dataBytes: number): bigint;
//# sourceMappingURL=GasMeter.d.ts.map