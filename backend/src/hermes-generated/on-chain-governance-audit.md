# On-Chain Governance Audit

**Task:** phase-07 / governance / step-1 (audit)
**Scope:** future `backend/src/governance/`

## What governance needs to decide

- Treasury spending (paying auditors, grant recipients, bounty payouts).
- Parameter changes (fee-market elasticity, block time target, validator min stake).
- Protocol upgrades (coordinated fork heights).
- Validator admission / removal.

## Current state

Zero. All of the above is operator-only today. Acceptable for single-operator testnet; unacceptable past the stakeholder-count threshold we're planning for.

## Proposal shape (for step-2)

```ts
interface GovernanceProposal {
  id: string;                 // keccak256(proposer + nonce)
  kind: 'treasury' | 'param' | 'fork' | 'validator';
  proposer: string;
  createdAtHeight: number;
  votingEndsAtHeight: number; // typically +72h worth of blocks
  executionHeight: number;    // ≥ votingEndsAt + execution delay
  payload: unknown;           // shape varies per kind
  state: 'voting' | 'queued' | 'executed' | 'vetoed' | 'expired';
}
```

## Voting

Stake-weighted. A validator with stake S contributes S to a `yes` or `no` tally. Quorum: >30% of total stake must vote. Pass: `yes > no`.

## Execution delay

Between `votingEndsAt` and `executionHeight` there's a 48-hour delay so stakeholders can observe the outcome and — in the extreme — soft-fork to veto a malicious proposal that passed. This is the classic "rage-quit" window.

## Treasury-specific rule

Treasury proposals specify a recipient + amount. If passed, the treasury account (a system account at a known address) auto-transfers at `executionHeight`. Capped at 10% of the treasury balance per proposal.

## Non-goals for step-1

- Not designing a full DAO with delegation, vote-splitting, or conviction voting. This is a minimum-viable protocol-governance layer; richer DAO mechanics go on contract-level libraries.
- Not choosing a voting cryptography upgrade (threshold sigs / SNARKs). Plain signed votes work at this scale.

## Follow-ups

- step-2 : typed `GovernanceProposal` record + state machine.
- step-3 : propose + vote + execute tx types.
- step-4 : regression tests.
