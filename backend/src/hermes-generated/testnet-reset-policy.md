# Testnet Reset Policy

**Task:** phase-10 / testnet-reset / step-1 (docs)

## Why

Testnets accumulate bad state — spam tokens, broken deployments, failed experiments. Periodic resets clear the slate without blowing away mainnet.

## Cadence

Every 6 months, OR whenever a non-backward-compatible protocol change lands and mainnet can't adopt it yet. Whichever comes first.

## Pre-reset checklist

1. Announce 14 days in advance on Discord, docs site banner, status page.
2. Snapshot the final state for archival: accounts, balances, contracts, logs.
3. Publish "how to claim mainnet drop" if any bonus tokens go to testnet participants.
4. Freeze new subscriptions 48 hours before reset (existing keep running).

## Reset procedure

1. Operator stops all validators.
2. Wipe `backend/dist/state/*` + Postgres schema.
3. Deploy new `genesis.testnet.json` with updated `genesisTimestampMs`.
4. Restart validators — they'll mint a fresh block 0.
5. Refill the faucet.
6. Unfreeze subscriptions.

## Data retention

- Archived state files stay on S3 for 2 years.
- Block explorer at `explorer-archive-<epoch>.hermeschain.xyz` reads from the archive so historical txs remain queryable.
- SDK client can query archived testnet via `?network=testnet-archive-<epoch>`.

## What carries over

Nothing on-chain carries over automatically. Operators who want continuity for their dApps:
- Redeploy contracts to new addresses.
- Re-register ABIs.
- Update frontend config.

## What doesn't

- No "migration transactions" that copy state.
- No pre-funded accounts except for system addresses (treasury, faucet).
- Validator keys don't transfer — register fresh.

## Mainnet is different

Mainnet doesn't reset. Ever. Upgrades ride via coordinated fork heights on a running chain. If mainnet can't handle a change, the change doesn't land.
