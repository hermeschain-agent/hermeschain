# Transaction Gossip Protocol

**Task:** phase-06 / tx-gossip / step-1 (design)
**Scope:** `backend/src/network/`

## Why gossip txs

A user submits a tx to one node. That node needs to share it with other validators so whoever ends up producing the next block includes it. Without gossip, throughput is capped by whichever node happens to own the next slot.

## Push mode

On successful `TransactionPool.accept`, broadcast `{type: 'tx_gossip', tx}` to every open peer. The receiver:
1. Decodes + validates as if submitted directly.
2. If `pool.has(tx.hash)` → drop (already seen).
3. Otherwise admit + relay to its own peers (gossip).

## Pull mode (catch-up)

A node joining the mesh can request recent pool contents from peers:
```
GET /api/mempool/snapshot?limit=500
→ PendingTxSummary[]
```

Reuses the `PendingTxSummary` shape from the pending-visibility workstream. Caller pulls full tx bodies per-hash as needed.

## Anti-amplification

Without bounds, one broadcast becomes N² peer-to-peer sends. Mitigations:
- Every node tracks `recentlyGossiped: LRU<txHash, timestamp>`; never re-broadcasts within 30s.
- Receiver-side dedup: ignore txs already in the pool or SeenTxSet.
- Per-peer rate: max 1000 gossip messages per peer per minute; breach → log + drop peer.

## Prioritization

When the outgoing gossip queue backs up, drop lowest-fee txs first. Align with the mempool's own eviction policy so a node never gossips a tx it would have evicted anyway.

## Observability

Metrics:
- `tx_gossip_sent_total` — count of outbound gossip messages
- `tx_gossip_received_duplicate_ratio` — fraction of gossip that was already in the local pool (high ratio = network is healthy)
- `tx_gossip_peer_dropped_total` — peers disconnected for rate-cap breach
