"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.interpreter = exports.Interpreter = void 0;
exports.parseVmProgram = parseVmProgram;
const GasMeter_1 = require("./GasMeter");
class Interpreter {
    execute(ops, gasLimit, ctx) {
        const meter = new GasMeter_1.GasMeter(gasLimit);
        const stack = [];
        const storage = {};
        const logs = [];
        for (let i = 0; i < ops.length; i++) {
            const instr = ops[i];
            switch (instr.op) {
                case 'PUSH': {
                    if (!meter.charge(GasMeter_1.GAS_COSTS.PUSH)) {
                        return { status: 'revert', gasUsed: meter.getSpent(), logs, storage, error: 'out-of-gas at PUSH' };
                    }
                    stack.push(instr.args[0]);
                    break;
                }
                case 'POP': {
                    if (!meter.charge(GasMeter_1.GAS_COSTS.POP)) {
                        return { status: 'revert', gasUsed: meter.getSpent(), logs, storage, error: 'out-of-gas at POP' };
                    }
                    stack.pop();
                    break;
                }
                case 'ADD': {
                    if (!meter.charge(GasMeter_1.GAS_COSTS.ADD)) {
                        return { status: 'revert', gasUsed: meter.getSpent(), logs, storage, error: 'out-of-gas at ADD' };
                    }
                    const a = Number(stack.pop() ?? 0);
                    const b = Number(stack.pop() ?? 0);
                    stack.push(a + b);
                    break;
                }
                case 'SUB': {
                    if (!meter.charge(GasMeter_1.GAS_COSTS.SUB)) {
                        return { status: 'revert', gasUsed: meter.getSpent(), logs, storage, error: 'out-of-gas at SUB' };
                    }
                    const a = Number(stack.pop() ?? 0);
                    const b = Number(stack.pop() ?? 0);
                    stack.push(b - a);
                    break;
                }
                case 'MUL': {
                    if (!meter.charge(GasMeter_1.GAS_COSTS.MUL)) {
                        return { status: 'revert', gasUsed: meter.getSpent(), logs, storage, error: 'out-of-gas at MUL' };
                    }
                    const a = Number(stack.pop() ?? 0);
                    const b = Number(stack.pop() ?? 0);
                    stack.push(a * b);
                    break;
                }
                case 'DIV': {
                    if (!meter.charge(GasMeter_1.GAS_COSTS.DIV)) {
                        return { status: 'revert', gasUsed: meter.getSpent(), logs, storage, error: 'out-of-gas at DIV' };
                    }
                    const b = Number(stack.pop() ?? 0);
                    const a = Number(stack.pop() ?? 0);
                    if (b === 0)
                        return { status: 'revert', gasUsed: meter.getSpent(), logs, storage, error: 'division by zero' };
                    stack.push(Math.trunc(a / b));
                    break;
                }
                case 'MOD': {
                    if (!meter.charge(GasMeter_1.GAS_COSTS.MOD)) {
                        return { status: 'revert', gasUsed: meter.getSpent(), logs, storage, error: 'out-of-gas at MOD' };
                    }
                    const b = Number(stack.pop() ?? 0);
                    const a = Number(stack.pop() ?? 0);
                    if (b === 0)
                        return { status: 'revert', gasUsed: meter.getSpent(), logs, storage, error: 'modulo by zero' };
                    stack.push(a % b);
                    break;
                }
                case 'EQ': {
                    if (!meter.charge(GasMeter_1.GAS_COSTS.EQ))
                        return { status: 'revert', gasUsed: meter.getSpent(), logs, storage, error: 'out-of-gas at EQ' };
                    stack.push(stack.pop() === stack.pop() ? 1 : 0);
                    break;
                }
                case 'LT': {
                    if (!meter.charge(GasMeter_1.GAS_COSTS.LT))
                        return { status: 'revert', gasUsed: meter.getSpent(), logs, storage, error: 'out-of-gas at LT' };
                    const b = Number(stack.pop() ?? 0);
                    const a = Number(stack.pop() ?? 0);
                    stack.push(a < b ? 1 : 0);
                    break;
                }
                case 'GT': {
                    if (!meter.charge(GasMeter_1.GAS_COSTS.GT))
                        return { status: 'revert', gasUsed: meter.getSpent(), logs, storage, error: 'out-of-gas at GT' };
                    const b = Number(stack.pop() ?? 0);
                    const a = Number(stack.pop() ?? 0);
                    stack.push(a > b ? 1 : 0);
                    break;
                }
                case 'AND': {
                    if (!meter.charge(GasMeter_1.GAS_COSTS.AND))
                        return { status: 'revert', gasUsed: meter.getSpent(), logs, storage, error: 'out-of-gas at AND' };
                    const a = BigInt(stack.pop() ?? 0);
                    const b = BigInt(stack.pop() ?? 0);
                    stack.push(Number(a & b));
                    break;
                }
                case 'OR': {
                    if (!meter.charge(GasMeter_1.GAS_COSTS.OR))
                        return { status: 'revert', gasUsed: meter.getSpent(), logs, storage, error: 'out-of-gas at OR' };
                    const a = BigInt(stack.pop() ?? 0);
                    const b = BigInt(stack.pop() ?? 0);
                    stack.push(Number(a | b));
                    break;
                }
                case 'NOT': {
                    if (!meter.charge(GasMeter_1.GAS_COSTS.NOT))
                        return { status: 'revert', gasUsed: meter.getSpent(), logs, storage, error: 'out-of-gas at NOT' };
                    const a = BigInt(stack.pop() ?? 0);
                    stack.push(Number(~a));
                    break;
                }
                case 'SSTORE': {
                    if (!meter.charge(GasMeter_1.GAS_COSTS.SSTORE)) {
                        return { status: 'revert', gasUsed: meter.getSpent(), logs, storage, error: 'out-of-gas at SSTORE' };
                    }
                    const [key, val] = instr.args;
                    storage[String(key)] = String(val);
                    break;
                }
                case 'LOG': {
                    const data = instr.args?.data ?? '';
                    const cost = (0, GasMeter_1.logGasCost)(Buffer.byteLength(data, 'utf8'));
                    if (!meter.charge(cost)) {
                        return { status: 'revert', gasUsed: meter.getSpent(), logs, storage, error: 'out-of-gas at LOG' };
                    }
                    logs.push({
                        address: ctx.contractAddress,
                        topics: instr.args?.topics ?? [],
                        data,
                        logIndex: logs.length,
                        transactionIndex: ctx.transactionIndex,
                        transactionHash: ctx.txHash,
                        blockHash: ctx.blockHash,
                        blockNumber: ctx.blockNumber,
                    });
                    break;
                }
                case 'STOP': {
                    meter.charge(GasMeter_1.GAS_COSTS.STOP);
                    return { status: 'success', gasUsed: meter.getSpent(), logs, storage };
                }
                case 'REVERT': {
                    meter.charge(GasMeter_1.GAS_COSTS.REVERT);
                    const reason = instr.args?.[0] ?? 'explicit revert';
                    return { status: 'revert', gasUsed: meter.getSpent(), logs, storage, error: reason };
                }
                default: {
                    return {
                        status: 'revert',
                        gasUsed: meter.getSpent(),
                        logs,
                        storage,
                        error: `unknown op: ${instr.op}`,
                    };
                }
            }
        }
        // Ran off the end without STOP/REVERT — treat as success.
        return { status: 'success', gasUsed: meter.getSpent(), logs, storage };
    }
}
exports.Interpreter = Interpreter;
/** Parse a `data` string that begins with `vm:` into an op list, or null if not a VM tx / malformed. */
function parseVmProgram(data) {
    if (!data || !data.startsWith('vm:'))
        return null;
    try {
        const parsed = JSON.parse(data.slice(3));
        if (!Array.isArray(parsed))
            return null;
        return parsed;
    }
    catch {
        return null;
    }
}
exports.interpreter = new Interpreter();
//# sourceMappingURL=Interpreter.js.map