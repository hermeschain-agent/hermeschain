/**
 * Block reward distribution.
 *
 * Phase-7 / rewards / step-2. Splits the reward pool for block H into
 * producer share + protocol treasury share. Inflation schedule comes
 * from GenesisConfig and tapers over time.
 */

export interface RewardPolicy {
  readonly genesisReward: string;
  readonly halvingEveryBlocks: number;
  readonly treasuryBasisPoints: number;  // 0-10000; 500 = 5%
}

const UINT = /^\d+$/;

export function makeRewardPolicy(input: Partial<RewardPolicy> = {}): RewardPolicy {
  const genesisReward = input.genesisReward ?? '5000000000000000000'; // 5 tokens
  const halvingEveryBlocks = input.halvingEveryBlocks ?? 2_100_000;
  const treasuryBasisPoints = input.treasuryBasisPoints ?? 500;

  if (!UINT.test(genesisReward)) {
    throw new Error('reward: genesisReward must be unsigned integer string');
  }
  if (!Number.isInteger(halvingEveryBlocks) || halvingEveryBlocks < 1) {
    throw new Error('reward: halvingEveryBlocks must be positive integer');
  }
  if (
    !Number.isInteger(treasuryBasisPoints) ||
    treasuryBasisPoints < 0 ||
    treasuryBasisPoints > 10_000
  ) {
    throw new Error('reward: treasuryBasisPoints must be 0-10000');
  }

  return Object.freeze({
    genesisReward,
    halvingEveryBlocks,
    treasuryBasisPoints,
  });
}

export interface RewardSplit {
  readonly totalReward: string;
  readonly producerShare: string;
  readonly treasuryShare: string;
}

export function computeReward(policy: RewardPolicy, height: number): RewardSplit {
  if (height < 0) throw new Error('reward: height must be >= 0');

  // How many halvings have occurred?
  const epoch = Math.floor(height / policy.halvingEveryBlocks);

  // After ~64 halvings the value is effectively zero. Clamp to prevent
  // BigInt shifts that overflow an implementation-defined limit.
  const clampedEpoch = Math.min(epoch, 63);
  const total = BigInt(policy.genesisReward) >> BigInt(clampedEpoch);

  const treasury = (total * BigInt(policy.treasuryBasisPoints)) / 10_000n;
  const producer = total - treasury;

  return Object.freeze({
    totalReward: total.toString(),
    producerShare: producer.toString(),
    treasuryShare: treasury.toString(),
  });
}
