/**
 * Typed MempoolPolicy.
 *
 * Phase-2 / mempool-rules / step-2. Policy is a read-only config
 * record; the enforcement engine (step-3) reads it to decide admit /
 * reject / evict on every pool operation.
 */

export type PoolOrdering = 'gasPrice' | 'insertion';
export type FullPoolAction = 'drop-new' | 'drop-lowest-fee';

export interface MempoolPolicy {
  readonly maxSize: number;
  readonly maxPerSender: number;
  readonly ttlMs: number;
  readonly orderBy: PoolOrdering;
  readonly onFull: FullPoolAction;
}

export function makeMempoolPolicy(input: Partial<MempoolPolicy> = {}): MempoolPolicy {
  const maxSize = input.maxSize ?? 10_000;
  const maxPerSender = input.maxPerSender ?? 32;
  const ttlMs = input.ttlMs ?? 2 * 60 * 1000;
  const orderBy = input.orderBy ?? 'gasPrice';
  const onFull = input.onFull ?? 'drop-lowest-fee';

  if (maxSize < 1) throw new Error('mempool: maxSize must be >= 1');
  if (maxPerSender < 1) throw new Error('mempool: maxPerSender must be >= 1');
  if (maxPerSender > maxSize) {
    throw new Error('mempool: maxPerSender cannot exceed maxSize');
  }
  if (ttlMs < 1000) throw new Error('mempool: ttlMs must be at least 1 second');
  if (orderBy !== 'gasPrice' && orderBy !== 'insertion') {
    throw new Error(`mempool: orderBy must be gasPrice or insertion, got "${orderBy}"`);
  }
  if (onFull !== 'drop-new' && onFull !== 'drop-lowest-fee') {
    throw new Error(`mempool: onFull must be drop-new or drop-lowest-fee, got "${onFull}"`);
  }

  return Object.freeze({ maxSize, maxPerSender, ttlMs, orderBy, onFull });
}

/** A tx is stale iff now > firstSeenMs + policy.ttlMs. */
export function isStale(firstSeenMs: number, policy: MempoolPolicy, now = Date.now()): boolean {
  return now - firstSeenMs > policy.ttlMs;
}
