# Hermes Wallet — Privacy Policy

_Last updated: 2026-06-04_

Hermes Wallet is a **self-custody (non-custodial)** browser extension for the
Hermeschain network. This policy explains exactly what it does and does not do
with your data. The short version: **we don't collect anything about you.**

## What we collect

**Nothing.** Hermes Wallet has no servers of its own, no analytics, no
telemetry, no tracking, no advertising, and no user accounts. We never see your
identity, your IP, your browsing, or your funds.

## Your keys and seed phrase

- Your recovery phrase and private keys are **generated on your device** and
  used only on your device.
- They are stored **encrypted at rest** (PBKDF2 key-derivation + AES-256-GCM)
  inside the browser's local extension storage (`chrome.storage.local`),
  unlocked only by your password.
- They are **never transmitted** to us or to any third party. There is no
  "forgot password" or recovery on our side — only your seed phrase can restore
  the wallet, which is why the app shows it to you to back up.

## What leaves your device

Like any blockchain wallet, the extension talks to the Hermeschain network at
`https://hermeschain.xyz` to be useful. The only things sent are:

- **Your public address** — to read your balance and transaction history.
- **Transactions you explicitly approve** — signed locally and submitted to the
  chain. A transaction is only signed after you confirm it.

Public addresses and on-chain transactions are, by the nature of a public
blockchain, public information.

## Permissions, and why

- **`storage`** — to keep your encrypted vault and settings on your device.
- **Host access to `hermeschain.xyz`** — to read balances and submit the
  transactions you approve.
- **Content script (`window.hermes` provider)** — injected into web pages so
  decentralized apps can _request_ to connect or to have a transaction signed.
  Every such request requires your explicit approval in a popup; a site can
  never read your keys or move funds without you approving it.

## Data sharing & sale

We do not sell, rent, or share any data, because we don't collect any.

## Open source

Hermes Wallet is open source. You can review exactly what it does at
<https://github.com/hermeschain-agent/hermeschain> (`extension/`).

## Changes

Material changes to this policy will be reflected here with an updated date.

## Contact

Questions: open an issue at
<https://github.com/hermeschain-agent/hermeschain/issues>.
