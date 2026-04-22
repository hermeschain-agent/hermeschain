# Test notes: ChainIdentity invariants

**Task:** foundation / chain-id / step-4 (cover)
**Target:** `backend/tests/chain-identity.test.ts`

## Invariants

1. Different `chainId` produces different `signingDomain`, `blockDomain`, and `chainIdHash`.
2. Same `chainId` produces byte-identical output across calls (deterministic).
3. `chainIdHash` is exactly 32 hex chars.
4. `applySigningDomain(identity, payload)` differs for any two identities even when the payload is identical.
5. `makeChainIdentity` rejects malformed chainId and non-semver versions.

## Scaffolding

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeChainIdentity,
  applySigningDomain,
} from '../src/hermes-generated/chain-identity-record';

const base = { chainId: 'hermeschain-testnet', protocolVersion: '0.4.2' };

test('different chainId → different domains + hash', () => {
  const a = makeChainIdentity(base);
  const b = makeChainIdentity({ ...base, chainId: 'hermeschain-main' });
  assert.notEqual(a.signingDomain, b.signingDomain);
  assert.notEqual(a.blockDomain, b.blockDomain);
  assert.notEqual(a.chainIdHash, b.chainIdHash);
});

test('deterministic', () => {
  const a = makeChainIdentity(base);
  const b = makeChainIdentity(base);
  assert.deepEqual(a, b);
});

test('chainIdHash is 32 hex chars', () => {
  const a = makeChainIdentity(base);
  assert.match(a.chainIdHash, /^[0-9a-f]{32}$/);
});

test('signed bytes differ per identity for same payload', () => {
  const a = makeChainIdentity(base);
  const b = makeChainIdentity({ ...base, chainId: 'hermeschain-main' });
  const payload = Buffer.from('hello', 'utf8');
  assert.notDeepEqual(applySigningDomain(a, payload), applySigningDomain(b, payload));
});

test('rejects malformed chainId', () => {
  assert.throws(() => makeChainIdentity({ ...base, chainId: 'hermes chain!' }));
  assert.throws(() => makeChainIdentity({ ...base, chainId: '' }));
});
```
