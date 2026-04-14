export declare class VirtualMachine {
    private stack;
    private bytecodeIndex;
    private bytecode;
    execute(bytecode: Uint8Array): number[];
    private executeOpcode;
    getStack(): number[];
}
//# sourceMappingURL=index.d.ts.map