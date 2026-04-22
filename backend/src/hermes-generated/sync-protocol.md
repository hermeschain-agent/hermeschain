# Sync Protocol: Catching Up a Lagging Node

**Task:** phase-06 / sync / step-1 (design)
**Scope:** `backend/src/network/`

## Problem

A node has been offline. It restarts and finds the network head is 10,000 blocks ahead. How does it catch up without re-executing every block?

## Three-phase sync

### Phase 1 — discovery

1. Query peers via `GET /api/network/peers`. Pick the 3 with highest reported heads.
2. Compare heads — if within 1 block, use the majority as target.
3. If peers disagree by more than 1 block, surface a warning and default to the longest head with signature agreement.

### Phase 2 — snapshot (fast path)

1. `GET /api/snapshot/latest` on a peer. Verify `metadata.blockHash` by cross-checking 2+ peers.
2. Stream chunks in parallel; verify each against `stateRoot`.
3. Write state to local store.

### Phase 3 — block replay

1. From `snapshot.height + 1` to peer head, pull blocks via `GET /api/chain/block/:height`.
2. Execute each tx, verify stateRoot matches block header, append to local chain.
3. Throughput target: ≥ 100 blocks/sec on commodity hardware (small txs).

## Resumption

Each phase writes a `sync-progress.json`:
```json
{
  "phase": "replay",
  "fromHeight": 372000,
  "currentHeight": 378542,
  "peerHead": 382585
}
```

A second restart reads this and resumes from `currentHeight + 1` instead of starting phase 1.

## Failure modes

- **Peer disagreement**: halt sync, emit `syncError: 'peer_disagreement'`, wait for operator.
- **Chunk verification fail**: blacklist that peer, retry chunk from another.
- **Block execution fail**: halt sync, emit `syncError: 'block_rejected', height: N, reason: ...`, require operator.

Sync never silently skips a bad block.
