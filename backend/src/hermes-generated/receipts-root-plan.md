# Wiring plan: receiptsRoot in block header

**Task:** phase-02 / tx-receipts / step-3 (wire canonical)
**Depends on:** [transaction-receipt.ts](transaction-receipt.ts), [canonical-encode.ts](canonical-encode.ts)

## Block header change

Add `receiptsRoot: string` to the block header. Header now:

```ts
interface BlockHeader {
  height: number;
  timestamp: number;
  parentHash: string;
  txRoot: string;
  receiptsRoot: string;     // ← new
  stateRoot: string;
  proposer: string;
  chainIdHash: string;      // from ChainIdentity work
  hash: string;             // derived
}
```

## Computation

For each block, accumulate the receipt array in tx-index order and hash it:

```ts
function computeReceiptsRoot(receipts: TransactionReceipt[]): string {
  const bytes = canonicalEncode(receipts);
  return sha256(bytes).toString('hex');
}
```

Future work (a separate Phase 3 state workstream) replaces this with a proper Merkle Patricia Trie of `txIndex → receipt`. Flat sha256 is sufficient until proof verification becomes a wallet requirement.

## Producer path

`BlockProducer.finalize(block)` at the end of tx execution:
1. Collect per-tx receipts from `StateManager.applyTransaction`.
2. `block.header.receiptsRoot = computeReceiptsRoot(receipts)`.
3. Persist receipts indexed by `txHash → receipt` in a key-value store.

## Validator path

On block receipt, validators recompute `receiptsRoot` from the block's tx-execution results and reject if it doesn't match the header.

## API integration

`GET /api/tx/:hash/receipt` reads the indexed store. O(1) lookup.

## Retro-receipts

For blocks produced before this rolls out, write synthetic receipts during a one-time catchup: `status='success', gasUsed='0', logs=[], receiptsRoot` recomputed and written to the block header's extra field (new header can't retroactively change, so store under `block.extra.receiptsRoot`). Wallets default to "pre-receipts" status for any block below the rollout height.
