# Contract deployment

```bash
hermes deploy program.json
# Returns: contract address (deterministic from sender + nonce)
```

Or via API:
`POST /api/contracts/deploy` with `{bytecode, deployedBy, signature}`. Server inserts into contract_code, returns address.
