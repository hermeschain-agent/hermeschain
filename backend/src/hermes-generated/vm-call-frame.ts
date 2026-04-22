/**
 * VM call frame.
 *
 * Phase-5 / vm-frame / step-2. One frame per nested CALL / STATICCALL
 * / DELEGATECALL. Frames carry their own gas budget, memory, and
 * storage-tree handle so a failure in a child call doesn't leak into
 * the parent's state until explicitly propagated.
 */

import { GasMeter } from './gas-schedule';

export type CallType = 'call' | 'staticcall' | 'delegatecall' | 'create';

export interface CallContext {
  readonly caller: string;
  readonly callee: string;
  readonly value: string;          // native-token transfer, BigInt-string
  readonly data: Uint8Array;        // calldata
  readonly type: CallType;
  readonly depth: number;           // 0 = top-level tx
  readonly readOnly: boolean;       // staticcall
}

export interface Frame {
  readonly ctx: CallContext;
  readonly gas: GasMeter;
  readonly memory: Uint8Array;
  readonly stack: bigint[];
  returnData: Uint8Array;
  reverted: boolean;
}

const MAX_DEPTH = 1024;

export function makeFrame(input: {
  caller: string;
  callee: string;
  value: string;
  data: Uint8Array;
  type: CallType;
  depth: number;
  readOnly: boolean;
  gasBudget: number;
}): Frame {
  if (input.depth > MAX_DEPTH) {
    throw new Error(`vm: call depth exceeds ${MAX_DEPTH}`);
  }
  if (input.type === 'staticcall' && !input.readOnly) {
    throw new Error('vm: staticcall requires readOnly = true');
  }
  if (input.readOnly && input.value !== '0') {
    throw new Error('vm: readOnly call cannot transfer value');
  }
  return {
    ctx: Object.freeze({
      caller: input.caller,
      callee: input.callee,
      value: input.value,
      data: input.data,
      type: input.type,
      depth: input.depth,
      readOnly: input.readOnly,
    }),
    gas: new GasMeter(input.gasBudget),
    memory: new Uint8Array(0),
    stack: [],
    returnData: new Uint8Array(0),
    reverted: false,
  };
}

/**
 * Create a child frame for a CALL-family opcode. Inherits or overrides
 * the `readOnly` flag based on the call type.
 */
export function childFrame(parent: Frame, input: {
  callee: string;
  value: string;
  data: Uint8Array;
  type: CallType;
  gasBudget: number;
}): Frame {
  const readOnly = parent.ctx.readOnly || input.type === 'staticcall';
  const caller = input.type === 'delegatecall' ? parent.ctx.caller : parent.ctx.callee;
  return makeFrame({
    caller,
    callee: input.callee,
    value: input.type === 'delegatecall' ? parent.ctx.value : input.value,
    data: input.data,
    type: input.type,
    depth: parent.ctx.depth + 1,
    readOnly,
    gasBudget: input.gasBudget,
  });
}
