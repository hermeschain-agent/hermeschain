# Test notes: ChainMetadata invariants

**Task:** foundation / chain-metadata / step-4 (cover)
**Target:** `backend/tests/chain-metadata.test.ts` (to be written)

## Four invariants to guard

1. **Genesis is fixed after block 0.** Any call to `snapshotMetadata()` after genesis returns the same `genesisTimestampMs`, regardless of the wall clock or subsequent block production.
2. **Height is monotonic non-decreasing.** Consecutive snapshots can only have the same or greater `height`. Never regresses on reconnect or reorg-under-depth.
3. **Latest hash matches height.** For `height > 0`, `latestHash` is the header hash of the block at index `height - 1`. Verified by re-hashing the block returned by `getLatestBlock()`.
4. **Stored-tx count is monotonic.** Successive snapshots return `storedTransactionCount` values that are non-decreasing. Memoization layer must not lie about counts.

## Test scaffolding (pseudocode)

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chain } from '../src/blockchain/Chain';
import { makeChainMetadata } from '../src/hermes-generated/chain-metadata-record';

test('genesis is fixed after block 0', async () => {
  const chain = new Chain();
  await chain.boot();
  const m1 = chain.snapshotMetadata();
  await chain.produceBlock();
  const m2 = chain.snapshotMetadata();
  assert.equal(m1.genesisTimestampMs, m2.genesisTimestampMs);
});

test('height is monotonic non-decreasing', async () => {
  const chain = new Chain();
  const heights: number[] = [];
  for (let i = 0; i < 4; i += 1) {
    heights.push(chain.snapshotMetadata().height);
    await chain.produceBlock();
  }
  for (let i = 1; i < heights.length; i += 1) {
    assert.ok(heights[i] >= heights[i - 1]);
  }
});

test('latest hash matches block at height - 1', async () => {
  const chain = new Chain();
  await chain.produceBlock();
  const m = chain.snapshotMetadata();
  const block = chain.getBlockAt(m.height - 1);
  assert.equal(m.latestHash, block.header.hash);
});

test('stored-tx count monotonic', async () => {
  const chain = new Chain();
  let prev = chain.snapshotMetadata().storedTransactionCount;
  for (let i = 0; i < 4; i += 1) {
    await chain.produceBlock(/* include 2 txs */);
    const c = chain.snapshotMetadata().storedTransactionCount;
    assert.ok(c >= prev);
    prev = c;
  }
});

test('makeChainMetadata rejects contradictions', () => {
  assert.throws(() =>
    makeChainMetadata({
      genesisTimestampMs: 0,
      height: 5,
      latestHash: null, // contradiction
      latestBlockTimestampMs: null,
      storedTransactionCount: 0,
      chainId: 'hermeschain-testnet',
    }),
  );
});
```

## Runtime verification

`npm run test` in `backend/`. Targeted regression: adding a new reorg path in a future task must re-prove invariants 2 and 4.
