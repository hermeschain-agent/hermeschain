# Getting Started: Your First Transaction

**Task:** phase-10 / getting-started / step-1 (docs)

A 10-minute path from "just saw the website" to "sent a tx on testnet."

## 1. Install the CLI

```bash
npm i -g @hermeschain/cli
hermes --version
```

## 2. Create a wallet

```bash
hermes wallet create
```

The CLI prints a 12-word mnemonic. **Write it down on paper.** Then press Enter to save an encrypted keystore to `~/.hermes/wallets/<address>.json`.

## 3. Fund the wallet from the faucet

```bash
hermes dev faucet $(hermes wallet show --field address)
```

Drips 1 HRM to the wallet's address. Cooldown: once per 24h per address.

## 4. Check your balance

```bash
hermes wallet balance $(hermes wallet show --field address)
```

Expect `1.0 HRM` after the faucet tx finalizes (~10 seconds).

## 5. Send a transaction

```bash
hermes wallet send \
  --from $(hermes wallet show --field address) \
  --to 0x1111...aaaa \
  --amount 0.1
```

The CLI prompts for your passphrase, signs locally, submits, and prints the tx hash.

## 6. Follow the tx

```bash
hermes chain tx <hash>
```

Output:
```
status       pending
fee          0.00021 HRM
```

Wait ~8 seconds, rerun:
```
status       included (block 382,586)
receipt      success, gasUsed 21000
```

Wait ~4 minutes, rerun:
```
status       finalized (32 blocks deep)
```

## Next steps

- [Deploying a contract](./contract-deploy.md)
- [Running a validator](./validator.md)
- [SDK reference](./sdk-reference.md)
