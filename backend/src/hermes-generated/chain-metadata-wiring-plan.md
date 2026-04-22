# Wiring plan: ChainMetadata through runtime + API surfaces

**Task:** foundation / chain-metadata / step-3 (wire canonical)
**Depends on:** [chain-metadata-record.ts](chain-metadata-record.ts)

## Goal

Thread `ChainMetadata` (the typed record from step-2) into the two surfaces the audit flagged as drifting:

1. `backend/src/blockchain/Chain.ts` — emits the record on demand
2. `backend/src/api/server.ts::buildAgentStatusPayload()` — consumes the record instead of reaching for individual getters

Along the way, fix the two drift points from the audit.

## Proposed wiring

### 1. `Chain.ts::snapshotMetadata()`

Add a single method that constructs and returns `ChainMetadata`:

```ts
import { makeChainMetadata, ChainMetadata } from '../hermes-generated/chain-metadata-record';

public snapshotMetadata(): ChainMetadata {
  const head = this.getLatestBlock();
  return makeChainMetadata({
    genesisTimestampMs: this.getGenesisTime(),
    height: this.getChainLength(),
    latestHash: head?.header.hash ?? null,
    latestBlockTimestampMs: head?.header.timestamp ?? null,
    storedTransactionCount: this.getStoredTransactionCount(),
    chainId: this.getChainId(),
  });
}
```

### 2. Memoize stored-tx count per height

`getStoredTransactionCount()` currently walks the chain on every call. Memoize by height so steady-state callers (SSE pulse every 5s) pay O(1):

```ts
private memoizedStoredTxCount = { height: -1, count: 0 };

public getStoredTransactionCount(): number {
  const height = this.getChainLength();
  if (this.memoizedStoredTxCount.height === height) {
    return this.memoizedStoredTxCount.count;
  }
  const count = /* existing scan */;
  this.memoizedStoredTxCount = { height, count };
  return count;
}
```

### 3. `api/server.ts::buildAgentStatusPayload()`

Replace the ad-hoc field assembly with a single call:

```diff
- genesisTimestamp: chain.getGenesisTime(),
- chainAgeMs: Date.now() - chain.getGenesisTime(),
- lastBlockTimestamp: chain.getLatestBlock()?.header.timestamp || null,
- blockHeight: chain.getChainLength(),
- transactionCount: chain.getStoredTransactionCount(),
- storedTransactionCount: chain.getStoredTransactionCount(),
+ chainMetadata: chain.snapshotMetadata(),
+ chainAgeMs: chainAgeMs(chain.snapshotMetadata(), Date.now()),
```

Frontend consumers that read `blockHeight` directly should migrate to `chainMetadata.height`. Keep the flat fields for one release cycle, then drop them.

## Follow-ups

- Step-4 (test) proves the four invariants against `snapshotMetadata()`.
- Unrelated: `--chainId` surface lives in a separate workstream; this wiring touches the field but doesn't own the invariant.
