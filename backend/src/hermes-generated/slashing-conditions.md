# Slashing Conditions

**Task:** phase-06 / slashing / step-1 (audit + design)
**Scope:** `backend/src/consensus/`

## What slashing is for

Penalize validators who act dishonestly — either by producing contradictory blocks or by going offline. Penalty = destroy some of their staked balance. Without slashing, a rational attacker has no economic cost for attempting forks.

## Two slashable offenses (scope for Phase 6)

### 1. Equivocation — signing two blocks at the same height

Evidence: two `BlockHeader`s at the same `height` with the same `proposer`, both validly signed, but different `hash`.

Penalty: 100% of the validator's stake. Equivocation is unambiguous and the severity must deter it.

### 2. Liveness failure — missing N consecutive proposer slots

Evidence: the validator was selected (step-2 `selectProposer` returned them) at blocks H, H+n, H+2n, ... and no block at those heights shows them as proposer.

Penalty: 0.1% of stake per missed slot, capped at 10% per day.

## Out of scope

- Double-voting (same height, two different head choices) — requires attestation messages that don't exist yet.
- Surround-voting (Casper-FFG style slot attestation overlap) — requires FFG, not in scope.
- Long-range attacks — require checkpoint signatures.

## Evidence record

```ts
interface SlashingEvidence {
  kind: 'equivocation' | 'liveness';
  validatorAddress: string;
  blockHeight: number;
  headerA?: string;   // hash of first block for equivocation
  headerB?: string;   // hash of second
  missedSlot?: number; // for liveness
  collectedAtHeight: number;
  collectedAtMs: number;
}
```

## Penalty application

A `slash` transaction type carries `SlashingEvidence`. Any validator can submit. Consensus verifies the evidence re-renders the claimed offense, then subtracts from the offending validator's stake at the next state root.

## Rollout

- Step-2: `SlashingEvidence` record + verification helpers.
- Step-3: slash tx type + evidence-pool alongside mempool.
- Step-4: tests covering both offenses + false-positive rejection.
