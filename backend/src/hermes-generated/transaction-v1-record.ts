/**
 * Canonical TransactionV1 shape.
 *
 * Phase-2 / tx-schema / step-2. Explicit version, chainId-bound,
 * BigInt-string amounts. `signature` and `hash` are derived from the
 * rest of the struct; the pre-sign canonical bytes exclude both.
 */

export interface TransactionV1 {
  readonly version: 1;
  readonly chainId: string;
  readonly from: string;
  readonly to: string;
  readonly amount: string;
  readonly gasLimit: string;
  readonly gasPrice: string;
  readonly nonce: number;
  readonly validAfterTimestampMs: number;
  readonly validBeforeTimestampMs: number;
  readonly data: string;
  readonly signature: string;
  readonly hash: string;
}

export interface TransactionPayload {
  version: 1;
  chainId: string;
  from: string;
  to: string;
  amount: string;
  gasLimit: string;
  gasPrice: string;
  nonce: number;
  validAfterTimestampMs: number;
  validBeforeTimestampMs: number;
  data: string;
}

const BIG_NUMBER_RE = /^\d+$/;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$|^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * Validate the shape; throw on any violation. Accepts a `TransactionPayload`
 * (everything except signature + hash).
 */
export function validatePayload(payload: TransactionPayload): void {
  if (payload.version !== 1) throw new Error('tx: version must be 1');
  if (!payload.chainId) throw new Error('tx: chainId required');
  if (!ADDRESS_RE.test(payload.from)) throw new Error(`tx: invalid from "${payload.from}"`);
  if (!ADDRESS_RE.test(payload.to)) throw new Error(`tx: invalid to "${payload.to}"`);
  if (!BIG_NUMBER_RE.test(payload.amount)) throw new Error('tx: amount must be unsigned integer string');
  if (!BIG_NUMBER_RE.test(payload.gasLimit)) throw new Error('tx: gasLimit must be unsigned integer string');
  if (!BIG_NUMBER_RE.test(payload.gasPrice)) throw new Error('tx: gasPrice must be unsigned integer string');
  if (!Number.isInteger(payload.nonce) || payload.nonce < 0) throw new Error('tx: nonce must be non-negative integer');
  if (payload.validBeforeTimestampMs <= payload.validAfterTimestampMs) {
    throw new Error('tx: validBefore must be > validAfter');
  }
  if (payload.data.length > 0 && !/^0x[0-9a-fA-F]*$/.test(payload.data)) {
    throw new Error('tx: data must be hex-encoded or empty');
  }
}

/** Drop signature + hash for pre-sign bytes. */
export function toSignablePayload(tx: Partial<TransactionV1>): TransactionPayload {
  return {
    version: 1,
    chainId: tx.chainId!,
    from: tx.from!,
    to: tx.to!,
    amount: tx.amount!,
    gasLimit: tx.gasLimit!,
    gasPrice: tx.gasPrice!,
    nonce: tx.nonce!,
    validAfterTimestampMs: tx.validAfterTimestampMs!,
    validBeforeTimestampMs: tx.validBeforeTimestampMs!,
    data: tx.data ?? '',
  };
}
