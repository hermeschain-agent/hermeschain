# Event Log Indexer

**Task:** phase-07 / log-indexer / step-1 (design)
**Scope:** `backend/src/indexer/`

## Problem

Receipts carry `logs: EventLog[]` — address + topics + data. Wallets and explorers need to filter: "give me all Transfer events affecting address X in the last 1,000 blocks." Scanning every receipt is O(total txs).

## Schema

```sql
CREATE TABLE event_logs (
  block_height  BIGINT NOT NULL,
  tx_index      INT    NOT NULL,
  log_index     INT    NOT NULL,
  address       TEXT   NOT NULL,
  topic0        TEXT,
  topic1        TEXT,
  topic2        TEXT,
  topic3        TEXT,
  data          TEXT,
  PRIMARY KEY (block_height, tx_index, log_index)
);
CREATE INDEX event_address_block ON event_logs (address, block_height DESC);
CREATE INDEX event_topic0_block  ON event_logs (topic0, block_height DESC);
CREATE INDEX event_topic0_topic1 ON event_logs (topic0, topic1, block_height DESC);
```

Four topic columns because ERC-20 / ERC-721 / most conventions use up to four indexed topics. Non-indexed data goes in the blob column.

## Populator

On every finalized block, walk its receipts and INSERT one row per log. Idempotent via the composite PK. No update path — logs are immutable.

## Query surface

```
GET /api/logs?
  address=<a>
  &topic0=<hash>
  &topic1=<hash>
  &fromBlock=<n>
  &toBlock=<n>
  &limit=<k>
```

Returns `{logs: EventLog[], nextCursor}`. Backend selects the most selective index: if `topic0 + topic1` both provided, use `event_topic0_topic1`. If only `address`, use `event_address_block`.

## Bloom filter (forward-compat)

EVM clients typically ship a 2048-bit Bloom per block in the header for O(1) filter miss. Not implemented in this rev — the SQL indexes give us the right latency for the current chain size. Document as a follow-up once the chain passes ~10M events.

## Non-goals

- No pre-built schema migration for popular event signatures (Transfer, Approve) — consumers filter client-side.
- No JSON-RPC `eth_newFilter` long-poll — subscription channel from the WebSocket work covers it.
