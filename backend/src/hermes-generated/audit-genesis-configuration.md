# Audit: Genesis Configuration Truth

**Task:** foundation / genesis-config / step-1 (audit)
**Scope:** `backend/src/blockchain/`
**Status:** grounded baseline for typed genesis contract

## Parameters that make up "genesis"

| Field | Owner file | Current source |
| --- | --- | --- |
| Chain ID | `blockchain/Chain.ts` | `CHAIN_ID` env, fallback `'hermeschain-testnet'` |
| Genesis timestamp | `blockchain/Chain.ts::getGenesisTime()` | wall-clock snapshot at first-boot |
| Initial validator set | `validators/ValidatorManager.ts` | seeded from env `INITIAL_VALIDATORS` |
| Initial allocations | (none — all balances start at zero) | — |
| Protocol version | `blockchain/Chain.ts` | hardcoded `'0.4.2'` |
| Block time target | `blockchain/BlockProducer.ts` | `BLOCK_INTERVAL_MS` env, fallback 8000ms |

## Drift / gaps

- **No single genesis file.** Parameters are scattered across env reads, hardcoded strings, and implicit defaults. On a fresh clone, reconstructing the canonical genesis requires reading four files.
- **Protocol version drift.** `'0.4.2'` appears as a literal in `Chain.ts`, in the frontend terminal's `TERMINAL_VERSION`, and in the MOTD logo. One canonical source would prevent silent drift.
- **Initial-allocation slot is empty.** No testnet faucet seed, no team/treasury allocations. If we add them later, the hash of block 0 changes and existing snapshots become invalid. Capture this absence explicitly in the typed contract so future migrations are explicit.
- **Genesis timestamp is captured at boot, not at protocol-defined instant.** A node that boots late writes a later genesis than one that booted on time. For a single-operator chain this is fine; for a multi-validator testnet it's not. Document the single-operator assumption in the typed contract.

## Contract step-2 will lock down

1. `GenesisConfig` struct with: chainId, genesisTimestampMs, protocolVersion, initialValidators[], initialAllocations{address→balance}, blockTimeTargetMs.
2. Immutable after construction, frozen with `Object.freeze`.
3. One `.json` at `backend/src/blockchain/genesis.json` is the durable source. Env overrides apply only in dev/test.
4. A `loadGenesis()` helper that asserts required fields and returns the typed record.

## Migration note

Changing any genesis field on a running chain invalidates block 0's hash. Treat `GenesisConfig` as append-only at runtime; schema migrations happen only at chain reset.
