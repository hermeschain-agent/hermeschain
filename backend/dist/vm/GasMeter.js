"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GasMeter = exports.GAS_COSTS = void 0;
exports.logGasCost = logGasCost;
/**
 * Per-opcode gas costs for the Hermes VM. Numbers borrow loosely from
 * EVM pricing so receipts look familiar, but the VM itself is not EVM.
 */
exports.GAS_COSTS = {
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
};
class GasMeter {
    constructor(limit) {
        this.spent = 0n;
        this.remaining = limit;
    }
    /** Charge `amount`. Returns true if the meter had enough; false if it ran out. */
    charge(amount) {
        if (amount > this.remaining) {
            this.spent += this.remaining;
            this.remaining = 0n;
            return false;
        }
        this.remaining -= amount;
        this.spent += amount;
        return true;
    }
    getSpent() {
        return this.spent;
    }
    getRemaining() {
        return this.remaining;
    }
}
exports.GasMeter = GasMeter;
function logGasCost(dataBytes) {
    return exports.GAS_COSTS.LOG_BASE + exports.GAS_COSTS.LOG_PER_BYTE * BigInt(dataBytes);
}
//# sourceMappingURL=GasMeter.js.map