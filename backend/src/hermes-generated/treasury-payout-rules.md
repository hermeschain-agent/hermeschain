# Treasury Payout Rules

**Task:** phase-07 / treasury / step-3 (design)
**Scope:** `backend/src/governance/`

## Constraints

- Cap: 10% of treasury balance per single proposal.
- Monthly rate cap: 25% of treasury across all proposals in a 30-day window.
- Minimum time-between-payouts-to-same-recipient: 14 days.
- Address denylist: slashed validators and their known forwarding addresses.

## Execution

At `executionHeight`, if proposal state is `queued` and no veto:
1. Recompute cap against **current** treasury balance (not at proposal time — protects against draining flash-grown treasury).
2. Check rate cap + recipient cooldown + denylist.
3. Emit a `TreasuryPayout` event log.
4. Transfer inside the same block, atomically with any other state changes.

Any cap breach → proposal transitions to `expired`, no payout, no refund to proposer (they accepted the rule).

## Veto path

A follow-up `VetoProposal` tx, voted in the same stake-weighted way with a stricter 60% quorum, can move a queued proposal to `vetoed` before `executionHeight`. Veto window = `queued` state only. Once executed, no rollback.

## Auditability

Every payout emits a structured log:

```json
{
  "kind": "treasury-payout",
  "proposalId": "...",
  "recipient": "0x...",
  "amount": "...",
  "capUsedBasisPoints": 420,
  "monthlyBudgetRemaining": "..."
}
```

Operator dashboards aggregate these for "where did the treasury go this quarter."
