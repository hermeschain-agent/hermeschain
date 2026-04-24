import { Log } from '../blockchain/TransactionReceipt';
/**
 * Hermes VM — a tiny JSON-op interpreter. Programs are arrays of ops:
 *
 *   [
 *     { op: 'PUSH', args: [2] },
 *     { op: 'PUSH', args: [3] },
 *     { op: 'ADD' },
 *     { op: 'LOG', args: { topics: ['0x01'], data: 'sum-emitted' } },
 *     { op: 'STOP' }
 *   ]
 *
 * A tx with `data = 'vm:' + JSON.stringify(ops)` gets executed; gas used
 * reflects actual work (per-op costs from GasMeter) and any LOG ops land
 * in the tx receipt. REVERT / out-of-gas return status:'revert' so the
 * caller can flag the receipt as failed without aborting the block.
 */
export type VmOp = {
    op: 'PUSH';
    args: [number | string];
} | {
    op: 'POP';
} | {
    op: 'ADD';
} | {
    op: 'SUB';
} | {
    op: 'SSTORE';
    args: [string, string];
} | {
    op: 'LOG';
    args: {
        topics?: string[];
        data?: string;
    };
} | {
    op: 'STOP';
} | {
    op: 'REVERT';
    args?: [string];
};
export interface ExecutionContext {
    readonly contractAddress: string;
    readonly txHash: string;
    readonly transactionIndex: number;
    readonly blockNumber: number;
    readonly blockHash: string;
}
export interface ExecutionResult {
    readonly status: 'success' | 'revert';
    readonly gasUsed: bigint;
    readonly logs: Log[];
    readonly storage: Record<string, string>;
    readonly error?: string;
}
export declare class Interpreter {
    execute(ops: VmOp[], gasLimit: bigint, ctx: ExecutionContext): ExecutionResult;
}
/** Parse a `data` string that begins with `vm:` into an op list, or null if not a VM tx / malformed. */
export declare function parseVmProgram(data?: string): VmOp[] | null;
export declare const interpreter: Interpreter;
//# sourceMappingURL=Interpreter.d.ts.map