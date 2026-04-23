/**
 * Abstract KV store interface.
 *
 * Phase-1 / chain-storage / step-2. Minimum contract backed by
 * leveldb (single-node), postgres (replicated), and an in-memory
 * map (tests). Higher-level modules (chain, state, receipts) key
 * off this.
 */

export interface KVStore {
  get(column: string, key: string): Promise<Buffer | null>;
  put(column: string, key: string, value: Buffer): Promise<void>;
  del(column: string, key: string): Promise<void>;

  /** Atomic batch: all writes succeed together or none do. */
  batch(writes: readonly BatchWrite[]): Promise<void>;

  /** Iterate a column in lex key order. Optional from+to bounds. */
  scan(column: string, opts?: ScanOptions): AsyncGenerator<KVEntry>;

  close(): Promise<void>;
}

export type BatchWrite =
  | { op: 'put'; column: string; key: string; value: Buffer }
  | { op: 'del'; column: string; key: string };

export interface ScanOptions {
  readonly fromKey?: string;
  readonly toKey?: string;
  readonly limit?: number;
  readonly reverse?: boolean;
}

export interface KVEntry {
  readonly key: string;
  readonly value: Buffer;
}

/** Columns the chain uses. Opening a store creates these if absent. */
export const CHAIN_COLUMNS = Object.freeze([
  'blocks',
  'state',
  'receipts',
  'events',
  'metadata',
]);

/** Helper to serialize a number as a lex-sortable 16-char hex string. */
export function heightKey(height: number): string {
  if (height < 0) throw new Error('kv: height must be non-negative');
  return height.toString(16).padStart(16, '0');
}
