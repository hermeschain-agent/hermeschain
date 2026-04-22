# Disaster Recovery Plan

**Task:** phase-08 / disaster-recovery / step-1 (docs)

## Scenarios covered

1. **Database loss** — Postgres volume corrupted or accidentally wiped.
2. **Validator key compromise** — private signing key leaked.
3. **Treasury account compromise** — someone drains the treasury.
4. **Whole-region Railway outage** — primary deploy unreachable for hours.
5. **Catastrophic consensus failure** — chain halts and manual intervention needed.

## Database loss

- **RPO** (max data loss): 15 min. Achieved via continuous WAL archive to off-cluster S3.
- **RTO** (recovery time): 60 min. Restore base backup + replay WAL.

Runbook:
1. Spin up a fresh Postgres instance.
2. Restore latest base backup.
3. Apply archived WAL files.
4. Point the backend `DATABASE_URL` at the new instance.
5. Restart services.

Chain state is authoritative; the DB is derived. Even a full DB loss doesn't threaten consensus — the indexer rebuilds from chain.

## Validator key compromise

- Detect via slashing event (equivocation) or external report.
- Immediately: run `hermes validator unbond --force`. Stake becomes unreachable to the attacker but remains slashable for the unbond period.
- Within 24 hours: file a slashing-claim against yourself (!) to burn the compromised stake before the attacker can weaponize it. Loss of stake beats loss-of-chain-integrity.
- Afterwards: generate a fresh key, register a new validator, restake.

## Treasury compromise

Requires coordinated governance response:
1. Emergency `param` proposal to freeze the treasury address (zero its spending cap).
2. Pass proposal via normal 2/3 vote + 48h execution delay.
3. Investigate + plan recovery via separate governance proposals.

No automatic rollback — treasury movements are chain state and can't be reverted without consensus.

## Regional outage

- Primary deploy is `us-west` on Railway.
- Secondary (warm standby): `eu-central` with hourly DB replica.
- Failover: update DNS `rpc.hermeschain.xyz` A record to the standby; update validators' `PUBLIC_URL` envs.
- RTO: 30 min (DNS TTL + validator re-registration).

## Catastrophic consensus failure

- Halt all validators (`hermes node stop`).
- Identify the bad block via logs.
- Agree on the last-good height among operator collective.
- All validators rewind to that height.
- Restart with fixed software.
- Accept the data loss between bad block and rewind.

This is nuclear — never expected, documented because we need the playbook before the bad day.

## Testing

Every DR scenario tested yearly in a tabletop exercise. Not automated because the scenarios involve human coordination.
