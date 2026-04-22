/**
 * Canonical chain-metadata record.
 *
 * Step-2 of foundation/chain-metadata. Gives the API, agent worker, and
 * validator a single typed source of truth for the four metadata fields
 * identified in the audit — genesis time, height, latest hash, stored-tx
 * count — so consumers stop reaching into `Chain` for mismatched shapes.
 *
 * Immutable after construction. Producers should build a fresh record
 * per snapshot rather than mutating fields in place.
 */

export interface ChainMetadata {
  /** UTC milliseconds of block 0; immutable after genesis. */
  readonly genesisTimestampMs: number;
  /** Current chain height. Monotonically non-decreasing. */
  readonly height: number;
  /** Header hash of the block at `height`. Empty chain → null. */
  readonly latestHash: string | null;
  /** UTC ms of the latest block's header.timestamp (block clock, not wall clock). */
  readonly latestBlockTimestampMs: number | null;
  /** Total transactions stored across all blocks; memoized per height. */
  readonly storedTransactionCount: number;
  /** Chain identity string surfaced by /api/agent/status. */
  readonly chainId: string;
}

export function makeChainMetadata(input: {
  genesisTimestampMs: number;
  height: number;
  latestHash: string | null;
  latestBlockTimestampMs: number | null;
  storedTransactionCount: number;
  chainId: string;
}): ChainMetadata {
  if (input.height < 0) throw new Error('chain height cannot be negative');
  if (input.storedTransactionCount < 0) {
    throw new Error('stored transaction count cannot be negative');
  }
  if (input.height > 0 && !input.latestHash) {
    throw new Error('non-empty chain must have a latest hash');
  }
  return Object.freeze({ ...input });
}

export function chainAgeMs(metadata: ChainMetadata, nowMs: number): number {
  // Derived from wall clock; safe because nothing persists this value.
  return Math.max(0, nowMs - metadata.genesisTimestampMs);
}
