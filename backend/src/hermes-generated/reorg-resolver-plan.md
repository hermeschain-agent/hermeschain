# Reorg Resolver Plan

**Task:** phase-04 / reorg / step-3 (wire canonical)
**Depends on:** [state-checkpoint-ring.ts](state-checkpoint-ring.ts)

## Entry points

1. **Block ingress**: every inbound block from gossip. If its `parentHash` doesn't match `chain.blockAt(height-1).hash` but the height is within `REORG_DEPTH` of head, trigger resolver.
2. **View change**: if a view change lands a block at a lower height than our head, the resolver handles the rollback.

## Resolver steps

```ts
async function resolveReorg(incoming: Block): Promise<ResolveResult> {
  // 1. Walk back to find the fork point — the shared ancestor.
  const forkHeight = await findForkPoint(incoming);
  if (forkHeight < checkpointRing.minHeight()) {
    return { kind: 'refused', reason: 'beyond finality' };
  }

  // 2. Acquire the chain mutex so no other writer interferes.
  const release = await chainMutex.acquire();
  try {
    // 3. Roll back local chain to fork point.
    const plan = checkpointRing.rollbackPlan(forkHeight);
    for (const cp of plan) {
      await stateManager.revertToCheckpoint(cp);
      await txPool.reAdmit(cp.reAdmittedTxHashes);
    }
    checkpointRing.truncateAbove(forkHeight);

    // 4. Apply the incoming branch in order.
    const branch = await fetchBranch(forkHeight, incoming);
    for (const block of branch) {
      await chain.apply(block);
    }

    metrics.reorg.inc({ depth: plan.length });
    return { kind: 'applied', depth: plan.length };
  } finally {
    release();
  }
}
```

## Edge cases

- **Incoming branch shorter than local**: GHOST fork choice decides; if incoming stake-weight > local, still switch.
- **Incoming branch fails validation mid-apply**: roll local back to the fork point; refuse the incoming branch entirely. Never commit a partial branch.
- **Mempool contains duplicates of re-admitted txs**: dedup via tx hash at re-admit time.

## Latency budget

- Lookup fork point: O(log N) via `skipHash` when available, else O(REORG_DEPTH) linear scan.
- Revert: O(sum(|dirtyKeys|) * log N) MPT updates.
- Apply: same as normal block application × branch length.

Target: resolve a depth-3 reorg in < 500ms. Anything worse logs a warning.

## Observability

- `reorg_total` — all resolved reorgs.
- `reorg_refused_total{reason}` — beyond finality, invalid branch.
- `reorg_resolution_duration_ms` histogram.
