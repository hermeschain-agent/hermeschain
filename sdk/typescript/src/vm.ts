import type { VmOp } from './types';

/**
 * Fluent builder for Hermes VM programs (TASK-276).
 *
 *   vmProgram()
 *     .push(2).push(3).add()
 *     .log({ topics: ['Sum'], data: 'computed' })
 *     .stop()
 *     .build();
 */
export function vmProgram() {
  const ops: VmOp[] = [];
  const api = {
    push(value: number | string) { ops.push({ op: 'PUSH', args: [value] }); return api; },
    pop() { ops.push({ op: 'POP' }); return api; },
    add() { ops.push({ op: 'ADD' }); return api; },
    sub() { ops.push({ op: 'SUB' }); return api; },
    mul() { ops.push({ op: 'MUL' }); return api; },
    div() { ops.push({ op: 'DIV' }); return api; },
    mod() { ops.push({ op: 'MOD' }); return api; },
    eq() { ops.push({ op: 'EQ' }); return api; },
    lt() { ops.push({ op: 'LT' }); return api; },
    gt() { ops.push({ op: 'GT' }); return api; },
    and() { ops.push({ op: 'AND' }); return api; },
    or() { ops.push({ op: 'OR' }); return api; },
    not() { ops.push({ op: 'NOT' }); return api; },
    sstore(key: string, val: string) { ops.push({ op: 'SSTORE', args: [key, val] }); return api; },
    log(args: { topics?: string[]; data?: string }) { ops.push({ op: 'LOG', args }); return api; },
    stop() { ops.push({ op: 'STOP' }); return api; },
    revert(reason?: string) { ops.push({ op: 'REVERT', args: reason ? [reason] : undefined }); return api; },
    build(): VmOp[] { return [...ops]; },
    /** Returns the `vm:` data prefix string ready to put in tx.data. */
    toTxData(): string { return 'vm:' + JSON.stringify(ops); },
  };
  return api;
}
