/**
 * PendingTxSummary — API-layer view over a pooled TransactionV1.
 *
 * Phase-2 / pending-visibility / step-2. Deliberately omits signature,
 * pubKey, raw bytes, and data payload — wallets and explorers don't
 * need those on a list call, and returning them multiplies the payload
 * cost. Fetch full tx via `GET /api/tx/:hash?include=raw`.
 */

import { canonicalEncode } from './canonical-encode';
import type { TransactionV1 } from './transaction-v1-record';

export type TxStatus =
  | 'pending'
  | 'included'
  | 'finalized'
  | 'failed'
  | 'unknown';

export interface PendingTxSummary {
  readonly hash: string;
  readonly from: string;
  readonly to: string;
  readonly amount: string;
  readonly gasPrice: string;
  readonly gasLimit: string;
  readonly nonce: number;
  readonly ageMs: number;
  readonly sizeBytes: number;
}

export interface TxStatusReport {
  readonly status: TxStatus;
  readonly hash: string;
  readonly includedInBlock?: number;
  readonly finalizedAtHeight?: number;
  readonly failureReason?: string;
}

export function summarizePendingTx(
  tx: TransactionV1,
  firstSeenMs: number,
  now = Date.now(),
): PendingTxSummary {
  const sizeBytes = canonicalEncode(tx).length;
  return Object.freeze({
    hash: tx.hash,
    from: tx.from,
    to: tx.to,
    amount: tx.amount,
    gasPrice: tx.gasPrice,
    gasLimit: tx.gasLimit,
    nonce: tx.nonce,
    ageMs: Math.max(0, now - firstSeenMs),
    sizeBytes,
  });
}

/** Derive status given chain position. Caller supplies finality depth. */
export function deriveStatus(input: {
  hash: string;
  inMempool: boolean;
  includedInBlock: number | null;
  currentHeight: number;
  finalityDepth: number;
  failureReason?: string;
}): TxStatusReport {
  if (input.failureReason) {
    return Object.freeze({ status: 'failed', hash: input.hash, failureReason: input.failureReason });
  }
  if (input.includedInBlock !== null) {
    if (input.currentHeight - input.includedInBlock >= input.finalityDepth) {
      return Object.freeze({
        status: 'finalized',
        hash: input.hash,
        includedInBlock: input.includedInBlock,
        finalizedAtHeight: input.includedInBlock + input.finalityDepth,
      });
    }
    return Object.freeze({
      status: 'included',
      hash: input.hash,
      includedInBlock: input.includedInBlock,
    });
  }
  if (input.inMempool) {
    return Object.freeze({ status: 'pending', hash: input.hash });
  }
  return Object.freeze({ status: 'unknown', hash: input.hash });
}
