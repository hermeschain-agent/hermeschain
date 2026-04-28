# Tutorial: Wallet recovery via mnemonic

```bash
curl -X POST https://hermeschain.io/api/wallet/import \
  -H 'Content-Type: application/json' \
  -d '{"mnemonic":"your twelve seed words go here ...","scanCount":20}'
```

Returns the derived addresses with on-chain activity flagged. See [HD wallet](../sdk/hd-wallets.md) for derivation path.
