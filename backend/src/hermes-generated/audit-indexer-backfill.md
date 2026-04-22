# Audit: Indexer Backfill

**Task:** phase-07 / indexer-backfill / step-1 (audit)

## Problem

A freshly-deployed indexer starts at `max(block_height)` in the index tables and only catches events from new blocks forward. Historical data — all blocks / txs / logs before the indexer shipped — is invisible.

## Rebuild strategy

A one-shot task (per the `one-shot-task-framework.md`) walks historical blocks in batches and writes their content into the index tables. Since blocks are immutable, the backfill is idempotent (INSERT ... ON CONFLICT DO NOTHING).

## Batch size

Too small (1 block) and the DB commit overhead dominates. Too large (10k blocks) and a failed batch re-runs a lot of work. Start at 1000 blocks per batch; tune based on wall time.

## Progress resumption

The task writes a checkpoint every 1000 blocks with the last-processed height:

```
key   = 'indexer_backfill:block_height'
value = '382500'
```

If interrupted, the task re-reads this key on next run and resumes from `value + 1`.

## Parallelism

Within a batch, block rows can be inserted in parallel — they don't conflict on the primary key. Across batches, serialize to keep the checkpoint advancing monotonically.

## Time estimate

At 382k blocks, avg 3 txs per block, ~20 logs per block:
- tx_index: 1.14M rows
- event_logs: 7.6M rows
- block_summary: 382k rows

At 10k rows/sec into Postgres, total wall time ~15 min. Acceptable for an operator-initiated op.

## Non-goals

- No cross-shard backfill — the chain is single-shard.
- No mid-backfill schema changes — finish first, migrate after.
