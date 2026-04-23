# Audit: Transaction Pool Sharding

**Task:** phase-11 / pool-sharding / step-1 (audit)

## Problem

One global `TransactionPool` is a single lock contention point. At ~1000 admits/sec, threads fight for the Map lock. Sharding by sender address spreads the load.

## Approach

`ShardedTransactionPool` wraps N inner pools (default 16). A tx is routed to shard `hash(from) % N`. Admits, lookups, and evictions operate on one shard at a time.

## What gets simpler

- Per-shard locks mean admission from sender A doesn't wait on admission from sender B.
- Per-sender cap checks are localized.
- Eviction walks one shard instead of the whole pool.

## What gets harder

- Global ops (size, ordered snapshot for block production) must fan out across shards and merge.
- Replace-by-fee: incoming tx with same (from, nonce) hits the right shard directly (same hash(from)). No cross-shard lookup.
- Mempool digest for gossip sync requires a merge step.

## Merge cost

At 16 shards, fanning out + merging is O(shards) plus whatever the per-shard op does. For admit-single-tx, overhead is ~1µs. For full pool snapshot, maybe 200µs. Acceptable.

## Config

Shard count is a `GenesisConfig` parameter so all validators agree. Changing shard count on a running chain is a consensus-breaking event (invalidates the block producer's ordering assumptions).

## Step-2+ rollout

- step-2: typed `ShardedTransactionPool` record.
- step-3: wire into admission path + block producer.
- step-4: tests covering cross-shard semantics.

## Non-goals

- No sharding by target address (less useful; txs are authored by senders, not targets).
- No dynamic resharding — resharding requires a fork height.
