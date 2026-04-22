/**
 * Typed Delegation record.
 *
 * Phase-7 / delegation / step-2. One delegator → one validator row.
 * A delegator delegating to multiple validators has multiple rows.
 */

export type DelegationState = 'active' | 'unbonding' | 'unbonded';

export interface Delegation {
  readonly delegator: string;
  readonly validator: string;
  readonly amount: string;          // BigInt-safe
  readonly rewardsAccrued: string;  // BigInt-safe
  readonly startHeight: number;
  readonly unbondHeight: number | null;
  readonly state: DelegationState;
  readonly autoRestake: boolean;
}

const UINT = /^\d+$/;

export function makeDelegation(input: Delegation): Delegation {
  if (!input.delegator) throw new Error('delegation: delegator required');
  if (!input.validator) throw new Error('delegation: validator required');
  if (input.delegator === input.validator) {
    throw new Error('delegation: self-stake uses validator_register, not delegate');
  }
  if (!UINT.test(input.amount) || input.amount === '0') {
    throw new Error('delegation: amount must be positive unsigned integer string');
  }
  if (!UINT.test(input.rewardsAccrued)) {
    throw new Error('delegation: rewardsAccrued must be unsigned integer string');
  }
  if (input.startHeight < 0) throw new Error('delegation: startHeight >= 0');
  if (input.state === 'unbonding' && input.unbondHeight === null) {
    throw new Error('delegation: unbonding state requires unbondHeight');
  }
  if (input.state === 'active' && input.unbondHeight !== null) {
    throw new Error('delegation: active state must not have unbondHeight');
  }
  return Object.freeze({ ...input });
}

/** Compute the delegator's share of a reward pool given commission. */
export function computeDelegatorReward(input: {
  delegationAmount: string;
  validatorTotalStake: string;
  rewardPool: string;
  commissionBasisPoints: number;
}): string {
  const amount = BigInt(input.delegationAmount);
  const total = BigInt(input.validatorTotalStake);
  const reward = BigInt(input.rewardPool);
  if (total === 0n) return '0';

  // Validator takes commission first from the full reward.
  const commission = (reward * BigInt(input.commissionBasisPoints)) / 10_000n;
  const afterCommission = reward - commission;

  // Remainder distributed pro-rata by stake.
  const share = (afterCommission * amount) / total;
  return share.toString();
}
