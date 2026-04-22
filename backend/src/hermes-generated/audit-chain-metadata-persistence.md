# Audit: Chain Metadata Persistence

**Task:** foundation / chain-metadata / step-1 (audit)
**Scope:** `backend/src/blockchain/`, `backend/src/api/`
**Status:** grounded baseline for later build steps

## Current surfaces

| Surface | Owner file | Produces |
| --- | --- | --- |
| Genesis timestamp | `blockchain/Chain.ts::getGenesisTime()` | UTC ms of block 0 |
| Latest height | `blockchain/Chain.ts::getChainLength()` | block count |
| Latest hash | `blockchain/Chain.ts::getLatestBlock()` | last block's header.hash |
| Stored tx count | `blockchain/Chain.ts::getStoredTransactionCount()` | sum across blocks |
| API mirror | `api/server.ts::buildAgentStatusPayload()` | re-reads the above each SSE tick |

## Drift found

- `buildAgentStatusPayload()` recomputes `chainAgeMs` from `Date.now() - genesisTime` on every call. The chain doesn't need the wall-clock; the **block clock** is authoritative (`latestBlock.header.timestamp - genesisTime`). Mixing the two opens inconsistency once validators disagree on wall-clock.
- `getStoredTransactionCount()` walks the full chain on every call. At 382k blocks this is a linear scan per SSE pulse. Memoize per block height.
- No single canonical struct holds all four — consumers reach into `chain` for different shapes. A `ChainMetadata` record type would let the API + agent worker read one object.

## Contract the later build steps must preserve

1. Genesis timestamp is immutable after block 0 (not wall-clock derived).
2. Height monotonically increases; never reset on reconnect.
3. Latest hash is `header.hash` of the block at `height`, not of the pending block.
4. Stored-tx-count grows monotonically and is derivable from block contents alone (no mempool).

These four invariants become the regression target in step 4.
