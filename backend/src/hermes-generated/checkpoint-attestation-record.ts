/**
 * CheckpointAttestation record.
 *
 * Phase-4 / bft-checkpoints / step-2. One signature by one validator
 * on the hash at a specific checkpoint height. Aggregated into block
 * headers at height+1 as proof the block is finalized.
 */

export interface CheckpointAttestation {
  readonly blockHeight: number;
  readonly blockHash: string;
  readonly validatorAddress: string;
  readonly signature: string;
}

const HEX32 = /^[0-9a-f]{64}$/;
const HEX64 = /^[0-9a-f]{128}$/;

export function makeAttestation(input: CheckpointAttestation): CheckpointAttestation {
  if (!Number.isInteger(input.blockHeight) || input.blockHeight < 0) {
    throw new Error('attestation: blockHeight non-negative integer');
  }
  if (!HEX32.test(input.blockHash)) {
    throw new Error('attestation: blockHash must be 32-byte lowercase hex');
  }
  if (!input.validatorAddress) {
    throw new Error('attestation: validatorAddress required');
  }
  if (!HEX64.test(input.signature)) {
    throw new Error('attestation: signature must be 64-byte lowercase hex');
  }
  return Object.freeze({ ...input });
}

export interface QuorumCheck {
  readonly signedStake: bigint;
  readonly totalStake: bigint;
  readonly reached: boolean;
}

/**
 * Given the validator set (with stakes) and the attestations observed,
 * compute whether 2/3 of total stake has signed.
 */
export function checkQuorum(
  attestations: readonly CheckpointAttestation[],
  stakeByAddress: ReadonlyMap<string, bigint>,
): QuorumCheck {
  const signers = new Set<string>();
  let signedStake = 0n;
  for (const a of attestations) {
    if (signers.has(a.validatorAddress)) continue; // dedup
    const stake = stakeByAddress.get(a.validatorAddress);
    if (stake === undefined) continue; // not in set
    signers.add(a.validatorAddress);
    signedStake += stake;
  }
  let totalStake = 0n;
  for (const s of stakeByAddress.values()) totalStake += s;
  const threshold = (totalStake * 2n + 2n) / 3n; // ceil(totalStake * 2 / 3)
  return {
    signedStake,
    totalStake,
    reached: signedStake >= threshold,
  };
}
