# Audit: Mempool Rules

**Task:** phase-02 / mempool-rules / step-1 (audit)
**Scope:** `backend/src/blockchain/`

## Questions a mempool policy has to answer

1. How many txs max in the pool? (memory)
2. What happens when the pool is full and a new tx arrives? (eviction)
3. How long does a tx linger before it's stale? (TTL)
4. Who gets priority when a block producer picks tx batches? (ordering)
5. What's the per-account cap so one spammy account can't fill the pool? (per-sender limit)

## Current state

- `TransactionPool` is a simple Map. No capacity, no TTL, no per-sender cap, no ordering beyond insertion. If an attacker submits 10k valid-but-zero-fee txs, they all sit in the pool forever.
- No fee-based ordering. Block producer picks in insertion order.
- No eviction. If the process restarts, the pool is wiped — not a policy, just a side effect.

## Policy contract step-2 will define

```
interface MempoolPolicy {
  maxSize: number;              // default 10_000
  maxPerSender: number;         // default 32
  ttlMs: number;                // default 2 * 60 * 1000
  orderBy: 'gasPrice' | 'insertion';  // default 'gasPrice'
  onFull: 'drop-new' | 'drop-lowest-fee';  // default 'drop-lowest-fee'
}
```

## Non-goals (deferred)

- Replace-by-fee: separate workstream.
- Dynamic fee market / EIP-1559 style auction: separate workstream.
- Cross-node mempool sync: network layer work, not policy.
