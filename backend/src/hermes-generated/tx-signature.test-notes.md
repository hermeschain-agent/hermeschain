# Test notes: TxSignature invariants

**Task:** phase-02 / tx-signatures / step-4 (cover)
**Target:** `backend/tests/tx-signature.test.ts`

## Invariants

1. Accepts a valid low-s ed25519 signature.
2. Rejects high-s (malleable) signature.
3. Rejects unsupported scheme.
4. Rejects wrong-length publicKey or signature.
5. Rejects non-hex or mixed-case input; output is always lowercase.
6. Frozen — mutating `.signature` throws.

## Scaffolding

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTxSignature } from '../src/hermes-generated/tx-signature-record';

const validSig = 'a'.repeat(128); // stub 64-byte hex; s-part starts with 'a' → low-s
const highSSig = (() => {
  // s-part >= L/2: first byte of s is 0xff ensures s > L/2
  const r = 'a'.repeat(64);
  const s = 'ff' + 'a'.repeat(62);
  // Reverse s (little-endian storage) for final sig
  const sLittleEndian = (s.match(/../g) ?? []).reverse().join('');
  return r + sLittleEndian;
})();
const pubKey = 'b'.repeat(64);

test('accepts low-s', () => {
  assert.doesNotThrow(() =>
    makeTxSignature({ scheme: 'ed25519', publicKey: pubKey, signature: validSig }),
  );
});

test('rejects high-s', () => {
  assert.throws(() =>
    makeTxSignature({ scheme: 'ed25519', publicKey: pubKey, signature: highSSig }),
    /high-s|malleable/,
  );
});

test('rejects unsupported scheme', () => {
  assert.throws(() =>
    makeTxSignature({ scheme: 'schnorr' as any, publicKey: pubKey, signature: validSig }),
  );
});

test('rejects wrong-length pubKey', () => {
  assert.throws(() =>
    makeTxSignature({ scheme: 'ed25519', publicKey: 'bb', signature: validSig }),
  );
});

test('rejects mixed case hex', () => {
  assert.throws(() =>
    makeTxSignature({ scheme: 'ed25519', publicKey: pubKey, signature: 'AA' + 'a'.repeat(126) }),
  );
});

test('frozen', () => {
  const s = makeTxSignature({ scheme: 'ed25519', publicKey: pubKey, signature: validSig });
  assert.throws(() => { (s as any).signature = 'z'; });
});
```
