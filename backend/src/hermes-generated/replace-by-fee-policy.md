# Replace-By-Fee Policy

**Task:** phase-07 / rbf / step-1 (design)
**Scope:** `backend/src/blockchain/`

## Problem

A user submits a tx with a low `maxPriorityFeePerGas`. Network is busier than they estimated; their tx sits in the mempool indefinitely. They want to re-submit the same intent (same `from`, same `nonce`) with a higher fee. Today the pool rejects it as a duplicate nonce.

## Policy

A new tx with `(from, nonce)` matching a pooled tx replaces the pooled one **iff**:

1. `maxFeePerGas` >= `oldTx.maxFeePerGas * 1.10` (10% bump).
2. `maxPriorityFeePerGas` >= `oldTx.maxPriorityFeePerGas * 1.10`.
3. New tx passes full admission (valid signature, within time window, not in SeenTxSet).

If any check fails → keep old, reject new. If all pass → evict old, admit new.

## Why 10%

Below this, attackers submit a flood of 1-wei-higher replacements and churn the mempool. Bitcoin uses the same floor for practical reasons (resistance to minor-fee spam).

## Edge cases

- **Same-fee replace**: reject. Forces senders to bump meaningfully.
- **Free tx replaced by paid tx**: fee check is skipped only when `oldTx.maxPriorityFeePerGas == 0` and the new tx has any tip. Accept.
- **Replacement from a different signer**: reject — replacement is per (from, nonce), not arbitrary.

## Observability

Each replacement emits `[MEMPOOL] replaced <oldHash> with <newHash> (+10% bump)`. Operator metrics count replacements-per-hour so an abnormal rate surfaces.

## Rollout

- Step-2: typed `ReplacementDecision = 'accept' | 'reject-too-low' | 'reject-no-incumbent' | 'reject-wrong-signer'`.
- Step-3: wire into `MempoolPolicy.accept()` as a pre-check before the capacity branch.
- Step-4: tests for each decision branch + bump-boundary.
