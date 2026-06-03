# Hermes Wallet — Chrome Web Store listing copy

Paste these into the Developer Dashboard listing fields. Tweak freely.

## Name
Hermes Wallet

## Summary (≤132 chars)
Self-custody wallet for Hermeschain. Keys are generated on-device and never leave it — hold HERMES, send, and connect to dapps.

## Category
Productivity

## Detailed description
Hermes Wallet is a self-custody (non-custodial) wallet for the Hermeschain
network. Your recovery phrase and private keys are generated on your device,
encrypted at rest (PBKDF2 + AES-256-GCM), and never sent to any server — your
keys, your coins.

Features
• Create or import a wallet from a 12/24-word recovery phrase
• View your on-chain HERMES balance and address
• Send signed transactions on the Hermeschain network
• Request testnet funds from the built-in faucet
• Connect to dapps via the injected `window.hermes` provider — every connect
  and signature requires your explicit approval
• Ed25519 / base58 keys, interoperable with the Hermeschain chain
• Open source: github.com/hermeschain-agent/hermeschain (extension/)

Privacy
No accounts, no analytics, no tracking. The wallet only sends your public
address (to read balances) and the transactions you approve. Full policy:
https://hermeschain.xyz/privacy

## Permission justifications (for the dashboard "Privacy practices" tab)
- **storage** — stores the encrypted wallet vault and settings locally on the
  user's device.
- **host_permissions (hermeschain.xyz)** — reads balances and submits the
  transactions the user approves.
- **content script on https://\*/\*** — injects the `window.hermes` provider so
  decentralized apps can request to connect or to have a transaction signed.
  All such requests are gated behind an explicit in-extension approval popup;
  the script never reads page content and never exposes keys. (This is the
  standard pattern for browser wallets, e.g. MetaMask.)
- **Remote code** — none. All code is bundled in the package; nothing is
  fetched and executed at runtime.
- **Data usage disclosures** — "Not being sold to third parties", "Not being
  used for purposes unrelated to the item's core functionality", "Not being
  used to determine creditworthiness / for lending". Check that the extension
  does NOT collect any of the listed personal/financial data categories.

## Screenshots (1280×800 or 640×400 PNG/JPEG — at least 1, up to 5)
Capture the popup (the toolbar popup is 360px wide; place it on the teal site
background or a neutral dark canvas, scaled up, for a clean 1280×800 frame):
1. **Balance / home** — the balance card (e.g. "100 HERMES"), address, and the
   Copy / Faucet / refresh row + the Send card.
2. **Send** — recipient + amount filled, "Sign & send" button.
3. **Recovery phrase backup** — the 12-word seed grid with the warning copy.
4. **Approve transaction** — the dapp approval screen ("Confirm transaction").
5. (optional) **Welcome / create** — the onboarding screen.

## Small promo tile (optional, 440×280)
Hermes logo on the deep-teal (#041C1C) background with the cream "HERMES"
wordmark — reuse `frontend/public/hermes-logo.png`.
