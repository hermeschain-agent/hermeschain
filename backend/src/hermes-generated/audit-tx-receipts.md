# Audit: Transaction Receipts

**Task:** phase-02 / tx-receipts / step-1 (audit)
**Scope:** `backend/src/blockchain/`

## Why receipts

A receipt is what a wallet / indexer / explorer keys off after a tx is included. Without structured receipts:

- Wallets can't show success/failure reliably (only "it's in a block").
- Indexers can't stream events for UI updates.
- Gas used / effective fee is invisible — wallets can't display "cost 0.023 H4".

## What doesn't exist yet

- No `Receipt` type at all.
- `StateManager.applyTransaction` returns `boolean` (applied / rejected). No structured reason.
- Block stores only tx hashes, not receipts.

## Step-2 contract

```ts
interface TransactionReceipt {
  txHash: string;
  blockHeight: number;
  txIndex: number;              // position in the block
  status: 'success' | 'reverted';
  gasUsed: string;
  effectiveGasPrice: string;
  cumulativeGasUsed: string;    // running total within the block
  logs: readonly EventLog[];
  revertReason?: string;
}

interface EventLog {
  address: string;
  topics: readonly string[];
  data: string;
}
```

## Storage

Receipts live in a receipts trie per block (Merkle Patricia Trie reusing step-2 of Phase 3/state workstream). The block header gains `receiptsRoot`. Wallets prove inclusion by verifying the trie path.

## API surface

`GET /api/tx/:hash/receipt` → `TransactionReceipt` or 404 if not mined yet. Already-finalized receipts are memoized by `txHash`.

## Migration

Current blocks have no receipts. Synthesize receipts for historical blocks (status=success, gasUsed=0, no logs) during a one-time catchup pass. Document this as a "retro-receipts" step in the release notes so wallets know the earliest real receipts come from block H.
