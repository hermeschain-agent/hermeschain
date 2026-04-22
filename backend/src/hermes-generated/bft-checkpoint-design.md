# BFT Checkpoint Design

**Task:** phase-04 / bft-checkpoints / step-1 (design)
**Scope:** `backend/src/consensus/`

## Why checkpoints

Depth-based finality (32 blocks) is ambiguous under prolonged partitions: two halves of the network can each build 32-block chains and both claim their blocks are finalized. Checkpoints bind finality to validator signatures, making long-range attacks infeasible.

## Checkpoint cadence

Every `checkpointEvery` blocks (default 128), proposer collects 2/3-stake-signed attestations on the block's hash. The collection itself becomes part of block H+1's header as `checkpointAttestations`.

## Attestation shape

```ts
interface CheckpointAttestation {
  blockHeight: number;
  blockHash: string;
  validatorAddress: string;
  signature: string;       // signs canonicalEncode({blockHeight, blockHash})
}
```

Verification:
1. Lookup validator in the set as of `blockHeight`.
2. Recompute the pre-sign bytes via canonicalEncode.
3. ed25519.verify against the validator's publicKey with the signing-domain prefix.

## Quorum

2/3 of the *total stake at checkpoint height*, not 2/3 of the validator *count*. A high-stake validator's attestation counts more. Threshold = `ceil(totalStake * 2 / 3)`.

## Finalized height under checkpoints

```
finalizedHeight = max(
  depthBasedFinalizedHeight,
  lastCheckpointedHeight
)
```

A block at or below `lastCheckpointedHeight` is irreversible — the fork-choice rule refuses to roll back beyond it even if a longer subtree appears.

## Rollout

1. Define `CheckpointAttestation` record with validation (step-2).
2. Add `checkpointAttestations` to the block header as an optional field (step-3).
3. Proposer collects attestations from peers over the gossip channel.
4. Validator on each node tracks `lastCheckpointedHeight` and uses it as a fork-choice guardrail.

## Risk

If the validator set goes offline en masse, no checkpoint forms and the chain falls back to depth-based finality alone. Acceptable degradation.
