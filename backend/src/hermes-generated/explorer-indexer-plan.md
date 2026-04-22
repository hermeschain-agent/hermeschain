# Block Explorer Indexer

**Task:** phase-07 / explorer-indexer / step-1 (design)
**Scope:** `backend/src/indexer/`, `backend/src/api/`

## Why an indexer

Pulling data straight from `Chain` for explorer queries is O(chain length) for anything more interesting than the head. An indexer precomputes two things as each block is finalized:

1. `tx_index`: `{txHash → blockHeight, txIndex}`
2. `account_txs`: `{address → [{blockHeight, txIndex, direction: 'in'|'out'}]}`

Both live in the existing `db` (Postgres / SQLite depending on deploy). Populated on block finalization (from `FinalityTracker.observe()`), queryable by the API layer in O(1) / O(k) respectively.

## Schema sketch

```sql
CREATE TABLE tx_index (
  tx_hash        TEXT PRIMARY KEY,
  block_height   BIGINT NOT NULL,
  tx_index       INT NOT NULL,
  from_address   TEXT NOT NULL,
  to_address     TEXT NOT NULL,
  amount         NUMERIC NOT NULL,
  status         TEXT NOT NULL
);
CREATE INDEX tx_index_from ON tx_index (from_address, block_height DESC);
CREATE INDEX tx_index_to   ON tx_index (to_address,   block_height DESC);

CREATE TABLE block_summary (
  height      BIGINT PRIMARY KEY,
  hash        TEXT NOT NULL UNIQUE,
  timestamp   BIGINT NOT NULL,
  proposer    TEXT NOT NULL,
  tx_count    INT NOT NULL,
  state_root  TEXT NOT NULL
);
```

## Backfill

On startup, scan the chain from `max(height)` forward and fill missing rows. Idempotent: INSERT ... ON CONFLICT DO NOTHING.

## Consumer queries

- `GET /api/account/:addr/txs?before=<h>&limit=50`: hit `tx_index_from/to` indexes, take 50.
- `GET /api/chain/block/:height`: single PK lookup on `block_summary`.
- `GET /api/tx/:hash`: PK lookup on `tx_index` → join to `block_summary` for header.

## Non-goals

- No on-chain data storage beyond what's already in blocks; the indexer is purely derived.
- No event log indexing (topics / address filter) — separate workstream; ships once the log pipeline from receipts is live.
