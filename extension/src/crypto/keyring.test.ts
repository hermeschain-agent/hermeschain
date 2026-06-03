/**
 * Interop tests: prove the extension keyring is byte-compatible with the
 * Hermeschain backend by feeding keyring-signed messages into the backend's
 * OWN Ed25519 verify (compiled from backend/src/blockchain/Crypto.ts).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  accountFromMnemonic,
  generateMnemonicPhrase,
  isValidMnemonic,
  buildSendMessage,
  signMessage,
  signSend,
} from './keyring.ts';
import * as backendCrypto from '../../../backend/dist/blockchain/Crypto.js';

test('mnemonic generation + validation', () => {
  const m = generateMnemonicPhrase(12);
  assert.equal(m.split(' ').length, 12);
  assert.equal(isValidMnemonic(m), true);
  assert.equal(isValidMnemonic('clearly not a valid bip39 phrase'), false);
});

test('derivation is deterministic and per-account distinct', async () => {
  const m = generateMnemonicPhrase(12);
  const a0 = await accountFromMnemonic(m, 0);
  const a0again = await accountFromMnemonic(m, 0);
  const a1 = await accountFromMnemonic(m, 1);
  assert.equal(a0.address, a0again.address);
  assert.notEqual(a0.address, a1.address);
  assert.equal(a0.address, a0.publicKey); // address IS the base58 pubkey
});

test('INTEROP: backend Ed25519 verify accepts a keyring-signed message', async () => {
  const acct = await accountFromMnemonic(generateMnemonicPhrase(12), 0);
  const message = buildSendMessage({
    fromAddress: acct.address,
    toAddress: 'hermes_recipient',
    amount: 100,
    nonce: 0,
    timestampMs: 1_700_000_000_000,
  });
  const signature = await signMessage(message, acct.privateKey);
  // backend verifies the signature using the address AS the public key
  assert.equal(backendCrypto.verify(message, signature, acct.address), true);
  // tampered message must fail
  assert.equal(backendCrypto.verify(message + 'x', signature, acct.address), false);
});

test('INTEROP: signSend payload is accepted by the backend verify', async () => {
  const acct = await accountFromMnemonic(generateMnemonicPhrase(12), 0);
  const signed = await signSend(acct, { toAddress: 'hermes_bob', amount: '42', nonce: 0 });
  const message = buildSendMessage(signed);
  assert.equal(backendCrypto.verify(message, signed.signature, signed.fromAddress), true);
});
