# ABI format

Hermes contract ABI is JSON describing events + (planned) methods. Stored in contract_metadata.abi_json.

```json
{
  "events": [
    { "name": "Transfer", "fields": [{"name":"from","type":"address"}, {"name":"to","type":"address"}, {"name":"value","type":"uint256"}] }
  ]
}
```

Topic-0 = sha256(`name(field1Type,field2Type,…)`).slice(0,32).
