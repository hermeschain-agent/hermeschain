# Hermes Wallet (browser extension)

A **self-custody** wallet for Hermeschain, shipped as an MV3 browser extension.
Private keys are generated on-device from a BIP39 seed phrase and **never leave
the browser** — the opposite of the legacy custodial faucet wallet, where the
server held the keys.

## Why it interoperates with the existing chain

The backend already verifies transfers with real Ed25519 (`POST
/api/wallet/send` checks `verify(message, signature, fromAddress)`), it just
never received client signatures. This extension fills that gap exactly:

| Concern        | Backend (`blockchain/Crypto.ts`)        | Extension (`src/crypto/keyring.ts`)        |
| -------------- | --------------------------------------- | ------------------------------------------ |
| Curve          | Ed25519                                 | Ed25519 (`@noble/ed25519`)                 |
| Address        | base58(publicKey)                       | base58(publicKey) (`bs58`, same alphabet)  |
| Signed message | `{kind:'wallet.send.v1',from,to,amount,nonce,timestampMs}` | identical builder        |
| Signature      | Ed25519 over UTF-8 bytes, base58        | identical                                  |

`src/crypto/keyring.test.ts` proves this by feeding keyring-signed messages
into the backend's **own** compiled `verify()` and asserting it returns `true`.

> Note: the legacy `/api/wallet/create` returns random `hermes_…` addresses not
> derived from any key, so those can't self-custody. This wallet uses
> `base58(pubkey)` addresses and registers them via `/api/wallet/import`.

## Status (incremental)

- [x] Keyring: BIP39 mnemonic → SLIP-0010 Ed25519 derivation → base58 address → sign
- [x] Backend-interop tests
- [ ] Encrypted keystore (AES-GCM, password-locked)
- [ ] Popup UI (create/import/unlock, balance, send, receive)
- [ ] `window.hermes` provider + content/background bridge (dapp connect + sign)

## Develop

```
cd extension
npm install
npm test        # runs the backend-interop keyring tests
npm run build   # bundles the MV3 extension into dist/ (load unpacked in Chrome)
```
