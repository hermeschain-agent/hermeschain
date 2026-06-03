import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createWallet,
  importWallet,
  unlock,
  lock,
  isInitialized,
  isUnlocked,
  getAccounts,
  getActiveAccount,
  addAccount,
  signTransfer,
  exportMnemonic,
  reset,
} from './wallet.ts';
import * as backendCrypto from '../../../backend/dist/blockchain/Crypto.js';

test('create → unlock → lock lifecycle', async () => {
  await reset();
  assert.equal(await isInitialized(), false);
  const { mnemonic, account } = await createWallet('pw123');
  assert.equal(mnemonic.split(' ').length, 12);
  assert.equal(await isInitialized(), true);
  assert.equal(isUnlocked(), true);
  assert.equal(getActiveAccount().address, account.address);

  lock();
  assert.equal(isUnlocked(), false);
  assert.throws(() => getActiveAccount(), /locked/);

  await unlock('pw123');
  assert.equal(isUnlocked(), true);

  lock();
  await assert.rejects(() => unlock('wrong'), /incorrect password/);
});

test('import restores the same address deterministically', async () => {
  const phrase = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
  await reset();
  const a = await importWallet('pw', phrase);
  await reset();
  const b = await importWallet('pw', phrase);
  assert.equal(a.address, b.address);
});

test('addAccount derives the next index', async () => {
  await reset();
  await createWallet('pw');
  assert.equal(getAccounts().length, 1);
  const next = await addAccount();
  assert.equal(getAccounts().length, 2);
  assert.notEqual(next.address, getAccounts()[0].address);
});

test('INTEROP: signTransfer produces a chain tx the backend accepts', async () => {
  await reset();
  await createWallet('pw');
  const tx = await signTransfer('HermesRecipientAddr1111111111111111111111', 250, 0);
  // 250 tokens → wei
  assert.equal(tx.value, (250n * 10n ** 18n).toString());
  const forVerify = {
    from: tx.from,
    to: tx.to,
    value: BigInt(tx.value),
    gasPrice: BigInt(tx.gasPrice),
    gasLimit: BigInt(tx.gasLimit),
    nonce: tx.nonce,
    data: tx.data,
    signature: tx.signature,
    hash: tx.hash,
  };
  assert.equal(backendCrypto.verifyTransactionSignature(forVerify), true);
});

test('exportMnemonic requires the password', async () => {
  await reset();
  const { mnemonic } = await createWallet('secret');
  assert.equal(await exportMnemonic('secret'), mnemonic);
  await assert.rejects(() => exportMnemonic('nope'), /incorrect password/);
});
