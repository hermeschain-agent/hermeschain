/**
 * Typed GovernanceProposal record.
 *
 * Phase-7 / governance / step-2. Stake-weighted voting. 48h execution
 * delay between votingEndsAt and executionHeight. State transitions:
 * voting → queued → executed | vetoed | expired.
 */

export type ProposalKind = 'treasury' | 'param' | 'fork' | 'validator';
export type ProposalState = 'voting' | 'queued' | 'executed' | 'vetoed' | 'expired';

export interface GovernanceProposal {
  readonly id: string;
  readonly kind: ProposalKind;
  readonly proposer: string;
  readonly createdAtHeight: number;
  readonly votingEndsAtHeight: number;
  readonly executionHeight: number;
  readonly payload: unknown;
  readonly state: ProposalState;
  readonly yesStake: string;
  readonly noStake: string;
}

const UINT = /^\d+$/;
const HEX32 = /^[0-9a-f]{64}$/;

export function makeProposal(input: GovernanceProposal): GovernanceProposal {
  if (!HEX32.test(input.id)) throw new Error('proposal: id must be 32-byte lowercase hex');
  if (!['treasury', 'param', 'fork', 'validator'].includes(input.kind)) {
    throw new Error(`proposal: unknown kind "${input.kind}"`);
  }
  if (!input.proposer) throw new Error('proposal: proposer required');
  if (input.votingEndsAtHeight <= input.createdAtHeight) {
    throw new Error('proposal: votingEnds must be after created');
  }
  if (input.executionHeight < input.votingEndsAtHeight) {
    throw new Error('proposal: execution must not precede voting end');
  }
  if (!UINT.test(input.yesStake) || !UINT.test(input.noStake)) {
    throw new Error('proposal: stake totals must be unsigned integer strings');
  }
  return Object.freeze({ ...input });
}

const QUORUM_NUM = 3n;
const QUORUM_DEN = 10n;

export function decideOutcome(
  proposal: GovernanceProposal,
  totalStakeAtVotingEnd: bigint,
): 'pass' | 'fail-no-quorum' | 'fail-no-majority' {
  const yes = BigInt(proposal.yesStake);
  const no = BigInt(proposal.noStake);
  const votes = yes + no;
  if (votes * QUORUM_DEN < totalStakeAtVotingEnd * QUORUM_NUM) {
    return 'fail-no-quorum';
  }
  return yes > no ? 'pass' : 'fail-no-majority';
}
