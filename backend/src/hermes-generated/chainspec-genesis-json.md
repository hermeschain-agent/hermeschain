# Chainspec genesis.json

**Task:** phase-01 / chainspec / step-1 (design)

## Goal

One authoritative file committed to the repo that describes the chain's genesis parameters. Loaded by every node via `loadGenesis()` from the genesis-config workstream.

## File location

`backend/src/blockchain/genesis.json` for mainnet.
`backend/src/blockchain/genesis.testnet.json` for testnet.

Env var `GENESIS_CONFIG_PATH` overrides in tests.

## Schema

```json
{
  "chainId": "hermeschain-mainnet",
  "protocolVersion": "0.6.0",
  "genesisTimestampMs": 1729555200000,
  "blockTimeTargetMs": 8000,
  "initialValidators": [
    {
      "address": "0xaaaa...",
      "publicKey": "aaaa...",
      "weight": 1000
    }
  ],
  "initialAllocations": [
    {
      "address": "0xtreasury...",
      "balance": "5000000000000000000000000"
    }
  ],
  "consensus": {
    "finalityDepth": 32,
    "checkpointEvery": 128,
    "unbondPeriod": 100800,
    "epochLength": 1024
  },
  "feeMarket": {
    "initialBaseFee": "1000000",
    "elasticityMultiplier": 2,
    "baseFeeMaxChangeDenominator": 8
  },
  "rewards": {
    "genesisReward": "5000000000000000000",
    "halvingEveryBlocks": 2100000,
    "treasuryBasisPoints": 500
  }
}
```

## Validation

Every field is type-checked via the `makeGenesisConfig` constructor. An invalid file halts startup rather than boots with defaults — a misconfigured mainnet is more dangerous than a failing one.

## Versioning

Bump `protocolVersion` (semver) on any breaking parameter change. The file itself isn't versioned; only the active one ships with each release.

## Immutability

Once the chain boots on a genesis.json, any change to the file on a running node **forks** that node off the rest. Changing genesis is a coordinated hard-fork event, not a deploy-time config tweak.

## Non-goals

- No runtime reload — genesis is read once at boot.
- No per-node overrides beyond test envs.
