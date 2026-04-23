# Audit: Chain Storage Layout

**Task:** phase-01 / chain-storage / step-1 (audit)
**Scope:** `backend/src/blockchain/`

## What exists

Blocks are serialized to individual JSON files in a data directory. Chain state (balances, nonces) lives in Postgres. Receipts and logs are scattered — some in memory, some in the event bus.

## Problems

- **Fragmentation**: three different storage layers (files, Postgres, memory) for pieces of the same logical state.
- **No atomicity across layers**: a crash mid-block can leave the chain in an inconsistent state (block file written, state partially updated).
- **Hard to snapshot**: the state-snapshot protocol needs a consistent view across all three layers.

## Target layout

Single persistent store abstraction (trait + N backing impls). Three impl slots:

1. `leveldb` — embedded, for single-node deployments.
2. `postgres` — shared DB, for replicated deployments.
3. `memory` — for tests.

Store columns:
- `blocks` — `{height, block}`.
- `state` — the MPT node-store.
- `receipts` — `{txHash, receipt}`.
- `events` — append-only log of everything.

All writes for a block go in one transaction. Block application either fully commits or fully rolls back.

## Migration

Existing deploys run the one-shot task `migrate-storage-v2` (from the one-shot framework) which reads the three current layers and writes into the unified store. Once complete, legacy paths are ignored.

## Non-goals

- No per-feature storage backends — one store abstraction per deploy.
- No real-time storage metrics beyond what Prometheus already exposes.
