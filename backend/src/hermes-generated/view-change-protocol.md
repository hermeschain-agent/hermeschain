# View Change Protocol

**Task:** phase-04 / view-change / step-1 (design)
**Scope:** `backend/src/consensus/`

## Problem

When the selected proposer fails to produce a block within the slot (offline, network partitioned, hung), the chain stalls. The consensus layer needs a deterministic fallback — a view change — that picks an alternate proposer without ambiguity.

## Slot timeout

Each validator runs a per-slot timer: `2 * blockTimeTargetMs` (default 16s). If no block arrives by timeout, the validator increments `viewNumber` for that slot and selects a new proposer.

## View-number selection

```
proposer(H, view) = selectProposer(
  validatorSet,
  sha256(prevBlockHash + ':' + view.toString()),
)
```

View 0 uses the standard selection. View 1, 2, 3... each produce a different entropy-driven pick. Honest validators agree because they all see the same `prevBlockHash` and increment in lockstep once the timeout fires.

## Equivocation risk

A validator who signs blocks in multiple views at the same height equivocates. Captured by the slashing work — `SlashingEvidence` with both headers triggers automatic stake loss.

## Propagation

View-change messages are thin: `{height, view, signerAddress, signature}`. They ride the same gossip channel as blocks. Quorum of 2/3-stake view-change signatures promotes the view globally.

## Live-ness tradeoff

Aggressive timeout (short) → more view changes under flaky network, wastes validator time.
Relaxed timeout (long) → offline proposers stall the chain longer.

Start with 2× block time; tune from operator experience.

## Rollout

Step-2 adds `ViewChangeMessage` record + quorum helper (mirror of `CheckpointAttestation`). Step-3 wires the per-slot timer. Step-4 adds regression tests.
