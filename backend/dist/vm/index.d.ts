export { Interpreter, interpreter, parseVmProgram } from './Interpreter';
export type { VmOp, ExecutionContext, ExecutionResult } from './Interpreter';
export { GasMeter, GAS_COSTS, logGasCost } from './GasMeter';
/** Legacy byte-opcode stub — retained for any caller still importing it. */
export declare class VirtualMachine {
    private stack;
    private bytecodeIndex;
    private bytecode;
    execute(bytecode: Uint8Array): number[];
    private executeOpcode;
    getStack(): number[];
}
//# sourceMappingURL=index.d.ts.map