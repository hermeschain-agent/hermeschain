import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptVault, decryptVault } from './vault.ts';

test('vault round-trips a seed phrase with the correct password', async () => {
  const secret = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
  const vault = await encryptVault('hunter2', secret);
  assert.equal(vault.v, 1);
  assert.notEqual(vault.ciphertext, secret);
  assert.equal(await decryptVault('hunter2', vault), secret);
});

test('vault rejects the wrong password', async () => {
  const vault = await encryptVault('correct horse', 'my seed phrase');
  await assert.rejects(() => decryptVault('battery staple', vault), /incorrect password/);
});

test('each encryption uses a fresh salt + iv', async () => {
  const a = await encryptVault('pw', 'same secret');
  const b = await encryptVault('pw', 'same secret');
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.ciphertext, b.ciphertext);
});
