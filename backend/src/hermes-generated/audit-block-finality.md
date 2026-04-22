# Audit: Block Finality

**Task:** phase-04 / finality / step-1 (audit)
**Scope:** `backend/src/blockchain/`

## What finality solves

Blocks get committed to the chain immediately as they're produced. If a reorg reverts a block, any state change in that block (tx inclusion, balance update) also reverts. Users and wallets need a signal: "this transaction is past the reorg-risk window." That signal is *finality depth*.

## Current state

- No finality tracker. Every block is treated as immediately canonical.
- Wallets have no way to distinguish "mined 1 minute ago" from "mined 20 minutes ago, very safe" — both look equally final.
- No cap on reorg depth. Theoretically a malicious validator could propose a long alternate history.

## Target

Two-level finality:
- **Implicit (depth-based)**: a block is considered *finalized* after `finalityDepth` (default 32) new blocks have been built on top of it.
- **Explicit (checkpoint signatures)**: a quorum of validators signs a periodic checkpoint. A checkpoint-signed block is finalized regardless of depth.

Phase 4 only scopes implicit finality. Explicit finality (BFT checkpoints) is a separate workstream.

## Step-2 contract

```ts
class FinalityTracker {
  constructor(depth: number = 32);
  observe(block: Block): Block | null;  // returns the newly-finalized block, if any
  finalityHeight(headHeight: number): number;
  isFinalized(blockHeight: number, headHeight: number): boolean;
}
```

`observe` is called on every new head. When the head moves from height H to H+1, any block at height ≤ H+1 − depth becomes finalized.

## API surface

`/api/agent/status` returns `{chain: {height, finalizedHeight}}` and `/api/tx/:hash` reports `'finalized'` status once `blockHeight <= finalizedHeight`.
