# Tutorial: Build your first contract

Get a tiny program running on Hermeschain in 10 minutes.

## What you'll build

A counter that increments and emits a log every time someone calls it.

## Prerequisites

- A wallet with some OPEN (use the [faucet](https://hermeschain.io/faucet))
- `curl` and `jq`

## Step 1 — Write the program

Hermeschain's VM takes JSON-op arrays. Make a file `counter.json`:

```json
[
  { "op": "PUSH", "args": [1] },
  { "op": "PUSH", "args": [1] },
  { "op": "ADD" },
  { "op": "LOG", "args": { "topics": ["incremented"], "data": "counter +1" } },
  { "op": "STOP" }
]
```

Five ops: push 1, push 1, add (top-of-stack = 2), emit a log, halt.

## Step 2 — Get your wallet info

```bash
ADDR=<your_address>
NONCE=$(curl -s https://hermeschain.io/api/account/$ADDR/next-nonce | jq -r .nextNonce)
echo "Next nonce: $NONCE"
```

## Step 3 — Sign and submit

For now, easiest path is the HUD's send form (paste the program into the
`data` field as `vm:<your JSON minified>`). Programmatic path coming with
the SDK (TASK-273).

```bash
PROGRAM=$(cat counter.json | jq -c .)
DATA="vm:${PROGRAM}"

curl -X POST https://hermeschain.io/api/transactions \
  -H 'Content-Type: application/json' \
  -d "{
    \"from\": \"$ADDR\",
    \"to\": \"$ADDR\",
    \"value\": \"0\",
    \"gasPrice\": \"1\",
    \"gasLimit\": \"100000\",
    \"nonce\": $NONCE,
    \"data\": \"$DATA\",
    \"signature\": \"$SIGNATURE\"
  }"
```

You'll get back `{ success: true, hash: '...' }`.

## Step 4 — Verify

```bash
curl https://hermeschain.io/api/tx/<hash>?decodeLogs=true | jq
```

You should see:

```json
{
  "status": 1,
  "gasUsed": "411",
  "logs": [
    {
      "address": "<your_addr>",
      "topics": ["incremented"],
      "data": "counter +1"
    }
  ]
}
```

That's it. You ran a contract on Hermeschain.

## Next

- [Sample contracts](../../examples/) — counter, ERC20-like, multisig, oracle
- [VM spec](../vm/spec.md) — every opcode + gas cost
- [Tutorial: query the chain](query.md) — read state via API or SDK
