# POST /api/wallet/send

## Body
```json
{
  "fromAddress": "...",
  "toAddress": "...",
  "amount": "<wei string>",
  "nonce": 0,
  "timestampMs": 1714425600000,
  "signature": "<base58 ed25519 sig>"
}
```

## Validation
- signature verified against fromAddress
- nonce must match account.nonce + max-pending
- timestamp must be within 5min of server time

## Response
`{ ok: true, hash: '<tx-hash>' }` or 401 (bad sig) / 409 (nonce mismatch)
