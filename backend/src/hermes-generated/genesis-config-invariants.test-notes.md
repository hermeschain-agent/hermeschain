# Test notes: GenesisConfig invariants

**Task:** foundation / genesis-config / step-4 (cover)
**Target:** `backend/tests/genesis-config.test.ts`

## Invariants to guard

1. **Semver protocolVersion.** Anything that isn't `MAJOR.MINOR.PATCH` must throw.
2. **Non-empty chainId.** Whitespace-only strings must throw; leading/trailing whitespace gets trimmed.
3. **Positive timestamps and intervals.** Zero and negative values must throw.
4. **At least one validator with positive total weight.** Empty validator sets or all-zero weights must throw.
5. **Supply preservation.** `totalInitialSupply(config)` equals the sum of `initialAllocations[*].balance` parsed as BigInt, regardless of allocation order.
6. **Deep immutability.** Mutating a returned config — or any nested validator / allocation — must throw in strict mode.

## Test scaffolding

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeGenesisConfig,
  totalInitialSupply,
} from '../src/hermes-generated/genesis-config-record';

const baseInput = {
  chainId: 'hermeschain-testnet',
  protocolVersion: '0.4.2',
  genesisTimestampMs: 1_700_000_000_000,
  blockTimeTargetMs: 8000,
  initialValidators: [
    { address: '0xaaa', publicKey: 'pubA', weight: 1 },
  ],
  initialAllocations: [
    { address: '0xbbb', balance: '1000' },
    { address: '0xccc', balance: '500' },
  ],
};

test('rejects non-semver protocol version', () => {
  assert.throws(() => makeGenesisConfig({ ...baseInput, protocolVersion: 'v0.4' }));
  assert.throws(() => makeGenesisConfig({ ...baseInput, protocolVersion: '0.4' }));
  assert.throws(() => makeGenesisConfig({ ...baseInput, protocolVersion: '' }));
});

test('rejects empty chainId', () => {
  assert.throws(() => makeGenesisConfig({ ...baseInput, chainId: '' }));
  assert.throws(() => makeGenesisConfig({ ...baseInput, chainId: '   ' }));
});

test('trims chainId whitespace', () => {
  const c = makeGenesisConfig({ ...baseInput, chainId: '  main-net  ' });
  assert.equal(c.chainId, 'main-net');
});

test('rejects non-positive timestamps and block intervals', () => {
  assert.throws(() => makeGenesisConfig({ ...baseInput, genesisTimestampMs: 0 }));
  assert.throws(() => makeGenesisConfig({ ...baseInput, blockTimeTargetMs: 0 }));
});

test('rejects empty validator set', () => {
  assert.throws(() => makeGenesisConfig({ ...baseInput, initialValidators: [] }));
});

test('rejects zero-weight validators', () => {
  assert.throws(() =>
    makeGenesisConfig({
      ...baseInput,
      initialValidators: [{ address: '0xaaa', publicKey: 'pubA', weight: 0 }],
    }),
  );
});

test('totalInitialSupply sums via BigInt', () => {
  const c = makeGenesisConfig(baseInput);
  assert.equal(totalInitialSupply(c), '1500');
});

test('totalInitialSupply handles big allocations without precision loss', () => {
  const c = makeGenesisConfig({
    ...baseInput,
    initialAllocations: [
      { address: '0xbbb', balance: '9007199254740993' }, // > Number.MAX_SAFE_INTEGER
      { address: '0xccc', balance: '1' },
    ],
  });
  assert.equal(totalInitialSupply(c), '9007199254740994');
});

test('config is deeply frozen', () => {
  const c = makeGenesisConfig(baseInput);
  assert.throws(() => { (c as any).chainId = 'x'; });
  assert.throws(() => { (c.initialValidators as any).push({}); });
  assert.throws(() => { (c.initialValidators[0] as any).weight = 99; });
});
```

Run via `npm run test` in `backend/`.
