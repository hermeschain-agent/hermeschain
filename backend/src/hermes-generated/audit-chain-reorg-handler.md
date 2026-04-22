# Audit: Chain Reorg Handler

**Task:** phase-04 / reorg / step-1 (audit)
**Scope:** `backend/src/blockchain/`

## When a reorg happens

Two honest proposers publish at the same height, each with 2/3 of something (peers, etc.). One branch eventually outweighs the other in GHOST fork choice. Nodes on the losing branch must:

1. Roll back their state to the fork point.
2. Apply the winning branch's blocks.
3. Put the losing branch's txs back in the mempool (they may still be valid on the winner).

## What breaks today

- No rollback implementation. State is committed on block application; there's no checkpoint to return to.
- No "orphaned tx" re-admit path. Txs in the losing branch are lost.
- No observer that detects a fork and triggers recovery — just silent state corruption.

## Components step-2 will add

### 1. StateCheckpoint per block

```ts
interface StateCheckpoint {
  blockHeight: number;
  blockHash: string;
  stateRoot: string;
  dirtyKeys: string[];      // keys changed in this block; enables O(dirty) revert
  prevValues: Map<string, string | null>;  // pre-block values for rollback
}
```

Keep the last `REORG_DEPTH` (= finalityDepth = 32) checkpoints in memory. Finalized blocks drop their checkpoints.

### 2. Reorg detector

Observes incoming blocks. If a block at height H arrives with parentHash != currentChain.blockAt(H-1).hash, trigger the reorg resolver.

### 3. Reorg resolver

1. Walk the incoming branch back to its parent until it meets the local chain (`fork point`).
2. Walk local chain back to fork point, reverting each block via checkpoint.prevValues.
3. Re-admit the reverted blocks' txs to the mempool (those still valid).
4. Apply the incoming branch blocks in order.

Emits `[REORG] at height <h>, depth <d>` + metrics.

## Constraints

- Reorgs beyond `REORG_DEPTH` are refused — the fork-choice rule already guarantees we never roll back past finalized blocks.
- Reorg mid-execution (proposer producing H+1 while rollback is happening) is avoided via a `chainMutex` held by the resolver.

## Observability

- `reorg_total` counter
- `reorg_max_depth_observed` gauge
- `reorg_duration_ms` histogram
- `reorg_txs_re_admitted_total`
