# Concept: Validators and Staking

**Task:** phase-10 / concept / step-4 (docs)

## What a validator does

- Watches incoming txs and gossips them.
- Runs the verification logic on every inbound block.
- When selected as proposer (probability proportional to stake), produces + signs the next block.
- Signs checkpoint attestations every 128 blocks.
- Votes on governance proposals.

## The economic bargain

A validator locks stake as a deposit. In exchange:

- Earns block rewards (genesis 5 HRM, halves every 2.1M blocks).
- Earns priority fees from txs included in blocks they produce.
- Takes a commission (≤ 30% configurable) from delegated stake.

In exchange-exchange, if a validator misbehaves:

- **Equivocation** (signing two different blocks at the same height): 100% of stake slashed.
- **Liveness** (missing slots): 0.1% per miss, capped 10%/day.
- **Downtime** (unreachable by peers): no direct slash, but missed slots add up.

## Why stake?

Proof-of-stake ties economic cost to consensus participation. Bitcoin-style proof-of-work does the same via electricity. Stake is cheaper to monitor, faster to finalize, and lets the protocol slash bad actors directly.

## Delegation

A holder who doesn't want to run a node delegates to a validator. The validator's effective stake = own + all delegated. Rewards split pro-rata after commission.

Delegators share the validator's slashing fate — there's no opting out of equivocation slashing while still earning rewards. Choose the validator carefully.

## The validator lifecycle

1. **Pending** (registered, waiting for epoch boundary).
2. **Active** (eligible for proposer selection).
3. **Unbonding** (9-day lock after signaling exit; still slashable).
4. **Unbonded** (funds returned to the registered wallet).

## Minimum stake

1000 HRM. Scales with total network stake — the validator set caps at 100 active slots, so at high saturation the effective minimum rises. Check `hermes validator min-stake` for the current number.

## Non-goals in this doc

- Specific slashing math details — see [slashing](./slashing.md).
- Fork choice — see [fork-choice](./fork-choice.md).
