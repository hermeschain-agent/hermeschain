# Validator Registration

**Task:** phase-06 / validator-lifecycle / step-1 (design)
**Scope:** `backend/src/validators/`

## New tx types

| Tx type | Effect |
| --- | --- |
| `validator_register` | stake funds + join set at next epoch |
| `validator_unbond` | signal intent to leave; funds locked for unbonding period |
| `validator_update` | change endpoint URL or pubkey (only between epochs) |
| `validator_slash_claim` | submit slashing evidence, triggers stake loss |

## Registration

```
validator_register {
  pubkey: 0x...,        // 32-byte ed25519
  stake:  1000 * 10^18, // minimum stake
  endpoint: https://node-n.example,
  commissionBasisPoints: 500,  // 5% cut from delegated stake
}
```

Enforced at admission:
- Stake ≥ `MIN_VALIDATOR_STAKE` (default 1000 HRM).
- Pubkey not already registered.
- Endpoint URL passes the `PEER_URL_RE` check from peer discovery.
- Commission ≤ 30% (3000 bp).

On success, validator enters `pending` state and becomes active at the next epoch boundary (every 1024 blocks).

## Unbonding

Stake is locked for `UNBOND_PERIOD` (default 100,800 blocks ≈ 9 days at 8s block time). During unbonding:
- Validator no longer proposes.
- Stake is still slashable for offenses committed before unbonding.
- At end of period, funds transfer to the validator's address.

This window protects against an attacker who double-signs and immediately withdraws.

## Epoch boundaries

At every `EPOCH_LENGTH = 1024` blocks:
1. Pending registrations → active.
2. Completed unbondings → stake released.
3. Validator set snapshot written to a durable index (for historical proof verification).

## Commission splits

When a block is produced, the reward splits:
- `treasury * 500 bp → treasury account` (from rewards config).
- Remaining: split between validator + delegators by stake weight.
- From each delegator's share, `commission * delegator_share → validator` as operator fee.

Delegation isn't implemented this rev — `commissionBasisPoints` lands as forward-compat.

## Audit trail

Every lifecycle event emits:
```
[VALIDATOR] <address> <event: register|unbond-start|unbond-end|slash> at height <h>
```

Consumed by OperatorHealth for the validator list card.
