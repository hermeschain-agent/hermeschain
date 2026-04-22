/**
 * Canonical TransactionReceipt shape.
 *
 * Phase-2 / tx-receipts / step-2. Frozen, deterministic, and
 * canonical-encode-friendly so receipts can be hashed for the
 * receiptsRoot in the block header.
 */

export type ReceiptStatus = 'success' | 'reverted';

export interface EventLog {
  readonly address: string;
  readonly topics: readonly string[];
  readonly data: string;
}

export interface TransactionReceipt {
  readonly txHash: string;
  readonly blockHeight: number;
  readonly txIndex: number;
  readonly status: ReceiptStatus;
  readonly gasUsed: string;
  readonly effectiveGasPrice: string;
  readonly cumulativeGasUsed: string;
  readonly logs: readonly EventLog[];
  readonly revertReason?: string;
}

const HEX_EVENT_FIELD = /^0x[0-9a-fA-F]*$/;
const UINT_STRING = /^\d+$/;

function validateEventLog(log: EventLog, prefix: string): void {
  if (!HEX_EVENT_FIELD.test(log.address)) throw new Error(`${prefix}.address must be 0x-hex`);
  for (const t of log.topics) {
    if (!HEX_EVENT_FIELD.test(t)) throw new Error(`${prefix}.topics[*] must be 0x-hex`);
  }
  if (!HEX_EVENT_FIELD.test(log.data)) throw new Error(`${prefix}.data must be 0x-hex`);
}

export function makeReceipt(input: {
  txHash: string;
  blockHeight: number;
  txIndex: number;
  status: ReceiptStatus;
  gasUsed: string;
  effectiveGasPrice: string;
  cumulativeGasUsed: string;
  logs?: EventLog[];
  revertReason?: string;
}): TransactionReceipt {
  if (!input.txHash) throw new Error('receipt: txHash required');
  if (input.blockHeight < 0) throw new Error('receipt: blockHeight must be >= 0');
  if (input.txIndex < 0) throw new Error('receipt: txIndex must be >= 0');
  if (input.status !== 'success' && input.status !== 'reverted') {
    throw new Error(`receipt: status must be success|reverted, got "${input.status}"`);
  }
  for (const field of ['gasUsed', 'effectiveGasPrice', 'cumulativeGasUsed'] as const) {
    if (!UINT_STRING.test(input[field])) {
      throw new Error(`receipt: ${field} must be unsigned integer string`);
    }
  }
  if (input.status === 'success' && input.revertReason) {
    throw new Error('receipt: revertReason is only valid for reverted status');
  }
  const logs = (input.logs ?? []).map((log, i) => {
    validateEventLog(log, `receipt.logs[${i}]`);
    return Object.freeze({
      address: log.address,
      topics: Object.freeze([...log.topics]),
      data: log.data,
    });
  });

  return Object.freeze({
    txHash: input.txHash,
    blockHeight: input.blockHeight,
    txIndex: input.txIndex,
    status: input.status,
    gasUsed: input.gasUsed,
    effectiveGasPrice: input.effectiveGasPrice,
    cumulativeGasUsed: input.cumulativeGasUsed,
    logs: Object.freeze(logs),
    ...(input.revertReason ? { revertReason: input.revertReason } : {}),
  });
}
