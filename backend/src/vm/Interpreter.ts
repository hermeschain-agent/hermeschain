import { Log } from '../blockchain/TransactionReceipt';
import { GasMeter, GAS_COSTS, logGasCost } from './GasMeter';

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

export type VmOp =
  | { op: 'PUSH'; args: [number | string] }
  | { op: 'POP' }
  | { op: 'ADD' }
  | { op: 'SUB' }
  | { op: 'SSTORE'; args: [string, string] }
  | { op: 'LOG'; args: { topics?: string[]; data?: string } }
  | { op: 'STOP' }
  | { op: 'REVERT'; args?: [string] };

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

export class Interpreter {
  execute(ops: VmOp[], gasLimit: bigint, ctx: ExecutionContext): ExecutionResult {
    const meter = new GasMeter(gasLimit);
    const stack: (number | string)[] = [];
    const storage: Record<string, string> = {};
    const logs: Log[] = [];

    for (let i = 0; i < ops.length; i++) {
      const instr = ops[i];
      switch (instr.op) {
        case 'PUSH': {
          if (!meter.charge(GAS_COSTS.PUSH)) {
            return { status: 'revert', gasUsed: meter.getSpent(), logs, storage, error: 'out-of-gas at PUSH' };
          }
          stack.push(instr.args[0]);
          break;
        }
        case 'POP': {
          if (!meter.charge(GAS_COSTS.POP)) {
            return { status: 'revert', gasUsed: meter.getSpent(), logs, storage, error: 'out-of-gas at POP' };
          }
          stack.pop();
          break;
        }
        case 'ADD': {
          if (!meter.charge(GAS_COSTS.ADD)) {
            return { status: 'revert', gasUsed: meter.getSpent(), logs, storage, error: 'out-of-gas at ADD' };
          }
          const a = Number(stack.pop() ?? 0);
          const b = Number(stack.pop() ?? 0);
          stack.push(a + b);
          break;
        }
        case 'SUB': {
          if (!meter.charge(GAS_COSTS.SUB)) {
            return { status: 'revert', gasUsed: meter.getSpent(), logs, storage, error: 'out-of-gas at SUB' };
          }
          const a = Number(stack.pop() ?? 0);
          const b = Number(stack.pop() ?? 0);
          stack.push(b - a);
          break;
        }
        case 'SSTORE': {
          if (!meter.charge(GAS_COSTS.SSTORE)) {
            return { status: 'revert', gasUsed: meter.getSpent(), logs, storage, error: 'out-of-gas at SSTORE' };
          }
          const [key, val] = instr.args;
          storage[String(key)] = String(val);
          break;
        }
        case 'LOG': {
          const data = instr.args?.data ?? '';
          const cost = logGasCost(Buffer.byteLength(data, 'utf8'));
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
          meter.charge(GAS_COSTS.STOP);
          return { status: 'success', gasUsed: meter.getSpent(), logs, storage };
        }
        case 'REVERT': {
          meter.charge(GAS_COSTS.REVERT);
          const reason = instr.args?.[0] ?? 'explicit revert';
          return { status: 'revert', gasUsed: meter.getSpent(), logs, storage, error: reason };
        }
        default: {
          return {
            status: 'revert',
            gasUsed: meter.getSpent(),
            logs,
            storage,
            error: `unknown op: ${(instr as any).op}`,
          };
        }
      }
    }

    // Ran off the end without STOP/REVERT — treat as success.
    return { status: 'success', gasUsed: meter.getSpent(), logs, storage };
  }
}

/** Parse a `data` string that begins with `vm:` into an op list, or null if not a VM tx / malformed. */
export function parseVmProgram(data?: string): VmOp[] | null {
  if (!data || !data.startsWith('vm:')) return null;
  try {
    const parsed = JSON.parse(data.slice(3));
    if (!Array.isArray(parsed)) return null;
    return parsed as VmOp[];
  } catch {
    return null;
  }
}

export const interpreter = new Interpreter();
