# Counter contract

The simplest possible Hermes VM program: pushes two values, adds them,
emits a log, halts. Useful as a "hello world" to verify your VM dispatch
+ receipt logging end-to-end.

## program.json

```json
[
  { "op": "PUSH", "args": [1] },
  { "op": "PUSH", "args": [1] },
  { "op": "ADD" },
  { "op": "LOG", "args": { "topics": ["increment"], "data": "counter incremented" } },
  { "op": "STOP" }
]
```

## Submit

```bash
PROGRAM=$(cat program.json)
curl -X POST https://hermeschain.io/api/transactions \
  -H 'Content-Type: application/json' \
  -d "{
    \"from\":\"<your_addr>\",
    \"to\":\"<your_addr>\",
    \"value\":\"0\",
    \"gasPrice\":\"1\",
    \"gasLimit\":\"100000\",
    \"nonce\":<your_nonce>,
    \"data\":\"vm:${PROGRAM}\",
    \"signature\":\"<sig>\"
  }"
```

## Expect

Receipt with:
- `status: 1` (success)
- `gasUsed`: ~411 (lower than the 100000 you supplied — dynamic gas)
- `logs[0]`: `{ address, topics: ['increment'], data: 'counter incremented' }`

## Why this matters

Demonstrates:
- VM dispatch via `vm:` prefix on `tx.data` (TASK-082)
- Dynamic gas (TASK-N — sum of per-op costs, not a flat 21000)
- Real log emission into the receipt (TASK-N)

Total receipt size: ~250 bytes. Useful for benchmarks.
