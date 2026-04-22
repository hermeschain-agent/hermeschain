# State Snapshot Protocol

**Task:** phase-03 / state-snapshots / step-1 (design)
**Scope:** `backend/src/blockchain/`

## Why

A fresh node catching up from genesis must re-execute every block. At 382k blocks, that's untenable. Snapshots let a node download verified state at a recent finalized height and fast-forward.

## Shape

```ts
interface StateSnapshot {
  height: number;
  blockHash: string;
  stateRoot: string;
  chunks: SnapshotChunk[];
  createdAtMs: number;
}

interface SnapshotChunk {
  index: number;
  total: number;
  // key-value range of the state trie for this chunk
  entries: Array<{ key: string; value: string }>;
  merkleProof: string;  // path from chunk contents to stateRoot
}
```

Each chunk is individually verifiable: a node downloads a chunk, verifies its Merkle path against the known `stateRoot`, and admits the entries to its local trie.

## Cadence

Snapshot every 10k blocks at a finalized height. Keep the last 3 snapshots on disk; older ones are garbage-collected.

## Consumer flow

1. Node boots, reads peer head `(height, stateRoot)` from `/api/chain/head`.
2. Pull snapshot metadata from `/api/snapshot/latest`.
3. Verify `metadata.blockHash` matches the block at `metadata.height` (fetched from a trusted peer).
4. Download chunks in parallel. Verify each.
5. Replay blocks from `metadata.height + 1` to current head (small delta).

## Size bound

At N accounts × avg value size, one snapshot is O(N). Chunked into 64 KB pieces to keep individual downloads resumable.

## Non-goals

- Not addressing snapshot authentication against the whole validator set — relies on depth-based finality to make the snapshot's blockHash reliable.
- Not compressing snapshots in this rev — gzip is a follow-up.
