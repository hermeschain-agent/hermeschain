# Concept: Blocks and Finality

**Task:** phase-10 / concept / step-2 (docs)

## A block's contents

Each block contains:
- Header: parent hash, height, timestamp, state root, tx root, receipts root, proposer, chain ID hash, baseFee, signatures.
- Body: list of transactions.
- Receipts: per-tx outcome (status, gasUsed, logs).

## Block time

Target interval is `blockTimeTargetMs` (default 8 seconds). Actual intervals vary slightly; the chain doesn't hard-reject late blocks but operators can observe drift via the `block_production_duration_ms` histogram.

## Finality

A transaction goes through four observable states:

1. **Pending** — in the mempool, not yet in any block.
2. **Included** — mined in a block, but that block could still be reverted by a reorg.
3. **Finalized** — far enough back in the chain that no further reorg can undo it.
4. **Failed** — rejected by the mempool or reverted during execution.

"Finalized" means the block is at least 32 deep (`finalityDepth`) **or** past the last BFT checkpoint — whichever is further back.

## What wallets should do

- Show "pending" immediately after submit.
- Show "1 confirmation" once the tx lands in a block.
- Show "finalized — safe" once past finality depth.
- Surface "reorged" if a tx's status regresses from `included` to `pending`. This shouldn't happen in normal operation but does exist as a possibility.

## Reorgs

A reorg happens when two validators propose at the same height and the minority-branch nodes switch to the majority branch. The protocol handles this automatically via GHOST fork choice; wallets observe the tx status regressing.

## Why 32 blocks (~4.3 minutes)?

Long enough that producing a 32-block alternate chain requires either majority-stake control or simultaneous network partition + restart — both expensive enough that depth-based finality is practically secure. BFT checkpoints promote safe blocks sooner when validators are online.

## Non-goals in this doc

- Didn't cover fork-choice algorithm details — see [fork-choice](../protocol/fork-choice.md).
- Didn't cover slashing — see [slashing](../protocol/slashing.md).
