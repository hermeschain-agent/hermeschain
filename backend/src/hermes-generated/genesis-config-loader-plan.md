# Wiring plan: GenesisConfig load path

**Task:** foundation / genesis-config / step-3 (wire canonical)
**Depends on:** [genesis-config-record.ts](genesis-config-record.ts)

## Goal

Replace the scattered env reads the audit found with a single `loadGenesis()` call that hydrates `GenesisConfig` from a durable source.

## Load-order precedence

1. `backend/src/blockchain/genesis.json` — production source of truth. Committed to the repo; any change here is a chain-reset event.
2. `process.env.GENESIS_CONFIG_PATH` — override path, used in tests.
3. Env-field fallbacks (`CHAIN_ID`, `PROTOCOL_VERSION`, `BLOCK_INTERVAL_MS`, `INITIAL_VALIDATORS` JSON) — for dev / first-boot only. Logged as a warning so an operator notices.
4. Hard fail if none of the above produces a valid config.

## Sketch

```ts
import { readFileSync } from 'fs';
import path from 'path';
import { GenesisConfig, makeGenesisConfig } from '../hermes-generated/genesis-config-record';

export function loadGenesis(repoRoot: string): GenesisConfig {
  const explicit = process.env.GENESIS_CONFIG_PATH;
  const canonical = path.join(repoRoot, 'backend/src/blockchain/genesis.json');
  const attempts = [explicit, canonical].filter(Boolean) as string[];

  for (const file of attempts) {
    try {
      const raw = JSON.parse(readFileSync(file, 'utf8'));
      return makeGenesisConfig(raw);
    } catch (err) {
      console.warn(`[GENESIS] Failed to load ${file}: ${(err as Error).message}`);
    }
  }

  console.warn('[GENESIS] Falling back to env defaults. Write a genesis.json before shipping.');
  return makeGenesisConfig({
    chainId: process.env.CHAIN_ID || 'hermeschain-testnet',
    protocolVersion: process.env.PROTOCOL_VERSION || '0.4.2',
    genesisTimestampMs: Number(process.env.GENESIS_TIMESTAMP_MS) || Date.now(),
    blockTimeTargetMs: Number(process.env.BLOCK_INTERVAL_MS) || 8000,
    initialValidators: parseValidators(process.env.INITIAL_VALIDATORS),
    initialAllocations: [],
  });
}
```

## Consumer migration

- `Chain.ts` — `getGenesisTime()` and `getChainId()` return `loadGenesis(repoRoot).genesisTimestampMs` / `.chainId`.
- `BlockProducer.ts` — `BLOCK_INTERVAL_MS` reads `loadGenesis().blockTimeTargetMs`.
- `ValidatorManager.ts` — seeds initial set from `loadGenesis().initialValidators`.
- Frontend `TERMINAL_VERSION` and MOTD version strings move to a `/api/genesis` endpoint that serves `protocolVersion`. Removes the three-file duplication called out in the audit.

## Non-goals

- Not implementing `loadGenesis()` in this commit. This is the design record; the implementation ships once the `genesis.json` file is authored and the consumers are ready.
- Not changing the existing chain runtime. A switch-over happens in a coordinated commit window so the block-0 hash doesn't shift mid-run.
