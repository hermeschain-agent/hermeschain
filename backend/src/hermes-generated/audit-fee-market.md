# Audit: Fee Market

**Task:** phase-07 / fee-market / step-1 (audit)
**Scope:** `backend/src/blockchain/`

## Why a fee market

Current state: txs carry no fee, block producer picks in insertion order. When the network is congested, there's no economic mechanism to prioritize urgent txs over background ones. Wallets have no signal for "what gas price will get my tx mined in the next block."

## Two-axis fee model (EIP-1559 inspired)

```
total fee = baseFee + priorityFee
total fee per gas = baseFee/gas + priorityFee/gas
total fee total   = (baseFee/gas + priorityFee/gas) × gasUsed
```

- `baseFee` is set per block by a deterministic rule from previous-block utilization. Burned (not paid to producer).
- `priorityFee` (tip) is set by sender, paid to the producer.
- `maxFeePerGas` is the sender's ceiling. If `baseFee > maxFeePerGas`, the tx isn't included.
- `gasUsed` comes from VM execution.

## Base-fee adjustment rule

Per EIP-1559:
- If previous block was over 50% utilization → baseFee goes up by `min(12.5%, …)`.
- If under 50% → baseFee goes down by `min(12.5%, …)`.

Computed in `BlockProducer.finalize()`; the new baseFee lands in the block header so all nodes agree.

## Tx-schema impact

`TransactionV1` already has `gasPrice` (legacy, single-axis). Add:
```ts
maxFeePerGas: string;
maxPriorityFeePerGas: string;
```
Old `gasPrice` becomes legacy: maps to `maxFeePerGas = maxPriorityFeePerGas = gasPrice`.

## Mempool ordering

Producer picks txs by `effectivePriorityFee = min(maxPriorityFeePerGas, maxFeePerGas - baseFee)`. Highest first. Replaces the simple `gasPrice` ordering in `MempoolPolicy`.

## Wallet UX

`GET /api/fee/suggested` returns:
```json
{ "baseFeePerGas": "12", "suggestedPriorityFeePerGas": "2", "estimatedTotalPerGas": "14" }
```

Wallets quote (estimated × gasLimit) as the upper bound on tx cost.

## Rollout

Consensus-breaking (block header gains `baseFeePerGas`). Coordinated fork height with the rest of Phase 2 schema work.
