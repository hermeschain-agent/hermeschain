# Concept: Fee Market

**Task:** phase-10 / concept / step-3 (docs)

## Two kinds of fee

A Hermeschain transaction pays:

- **Base fee** — a per-gas amount set by the protocol based on recent block utilization. **Burned.** Doesn't go to anyone.
- **Priority fee (tip)** — a per-gas amount set by the sender. **Paid to the block producer** who includes the tx.

Total fee paid = `gasUsed * (baseFee + priorityFee)`.

## Why burn the base fee

Burning removes supply each block. Under congestion, net issuance (block reward − burned base fees) can go negative, which limits inflation. Without burning, congestion would fuel unlimited issuance.

## Setting your own fees

Wallets expose three knobs:

- `maxFeePerGas` — the highest total (base + tip) you're willing to pay.
- `maxPriorityFeePerGas` — how much you're willing to tip.
- `gasLimit` — the maximum `gasUsed` allowed. Unused gas is refunded.

Effective payment per gas = `min(maxFeePerGas, baseFee + maxPriorityFeePerGas)`.

If `baseFee` rises above your `maxFeePerGas` in a block, your tx isn't included that block and waits for either a drop or your resubmission at a higher cap.

## Good defaults

- `maxPriorityFeePerGas` = suggested value from `GET /api/fee/suggested` (updated each block).
- `maxFeePerGas` = 2 * current `baseFee` + priority fee (gives runway for one more doubling period).

Wallets should make these defaults one-click adjustable for power users who want to pay less.

## Replacement transactions (RBF)

If your tx is stuck because you underestimated priority fee, submit a replacement with the same `(from, nonce)` and a fee bump of at least 10% on both `maxFeePerGas` and `maxPriorityFeePerGas`. The mempool evicts the old and admits the new. See [replace-by-fee](./rbf.md).

## Why EIP-1559?

The alternative is plain first-price auction (single `gasPrice`). Under congestion it becomes a guessing game that over-pays in steady state and under-pays during sudden spikes. The EIP-1559 base+tip split gives predictable steady-state pricing with responsive tip-based prioritization.
