# Bundler Mempool

**Task:** phase-09 / account-abstraction / step-3 (design)

## Why a separate mempool

UserOperations aren't valid transactions until a bundler wraps them into one. Mixing them into the tx mempool would break admission ordering (pool expects signed txs, ops are pre-validation). Keep two pools.

## Admission flow

1. Bundler receives UserOperation over HTTPS (`POST /api/aa/userop`).
2. Simulate via `staticcall` to the sender contract's `validateUserOp`.
3. If validation returns non-zero → reject with reason.
4. Capacity check: 512 ops max, 8 ops/sender.
5. Admit with timestamp.

## Ordering

Sort by `maxPriorityFeePerGas` desc, then `receivedAt` asc. Highest-tip op gets bundled first.

## Bundle production

Every `BUNDLE_INTERVAL_MS` (default 4000ms) or when mempool reaches 32 ops:
1. Pick top K ops (K ≤ 32) without violating per-sender limits.
2. Re-simulate each (state may have changed since admission).
3. Drop ops that now fail simulation.
4. Wrap surviving ops into a single `entrypoint.handleOps(ops)` transaction.
5. Sign with bundler key; submit to tx mempool.

## Failure modes

- Op passes admission but fails second simulation → dropped silently, reported back to submitter via `GET /api/aa/userop/:hash`.
- Bundler's own balance insufficient for gas → halt bundling, page operator.
- Handled tx reverts → all ops in the bundle marked failed in the receipt; individual `status` fields surfaced to submitters.

## Observability

- `bundler_ops_admitted_total`
- `bundler_ops_rejected_total{reason}`
- `bundler_bundles_sent_total`
- `bundler_avg_ops_per_bundle`

## Non-goals

- No gossip between bundlers in this rev; each operates its own local pool.
- No priority based on submitter identity — purely fee-weighted.
