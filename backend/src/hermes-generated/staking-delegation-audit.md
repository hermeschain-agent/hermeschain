# Staking / Delegation Audit

**Task:** phase-07 / delegation / step-1 (audit)
**Scope:** future `backend/src/staking/`

## Why delegation

Not every HRM holder wants to run a validator. Delegation lets holders earn a share of block rewards by pledging stake to a validator without operating a node themselves. Lowers the barrier to participation and increases total economic security.

## Model

```ts
interface Delegation {
  delegator: Address;
  validator: Address;
  amount: string;          // BigInt-safe
  startHeight: number;
}
```

- Delegator picks a validator; stake is locked in the validator's stake pool.
- Validator's effective stake for selection = self-stake + sum(delegations).
- Rewards earned by the validator split proportionally, minus validator's commission.

## Slashing propagation

If the validator is slashed:
- Equivocation (100% stake): delegator stake also 100% slashed. Same economic risk.
- Liveness (0.1%/miss, 10%/day cap): delegator stake takes the same proportional hit.

Delegators sign up for "same fate as validator." No partial protection.

## Undelegation

Same `UNBOND_PERIOD` as validator unbonding. Stake unavailable to move during unbond.

## Active set cap

With delegation, a small number of large-stake validators could dominate. Cap the active set at `MAX_ACTIVE_VALIDATORS` (default 100). If more than 100 are registered, the top 100 by stake are active; the rest are in a waiting list.

## Reward distribution

Per block:
1. Block reward + priority fees → validator's reward pool.
2. Validator takes commission.
3. Remainder distributed pro-rata to (self-stake + delegations).

Compound option: delegator can set `autoRestake: true` to have rewards automatically added to the delegation instead of sent to the account.

## Rollout

- step-2: typed `Delegation` record.
- step-3: `delegate` / `undelegate` tx types.
- step-4: reward-distribution math with compound.
- step-5: active-set cap + waiting list.

## Non-goals

- No liquid staking (tokenized claim-on-stake) — separate workstream.
- No re-delegation without unbond — encourages stake shopping, out of scope.
