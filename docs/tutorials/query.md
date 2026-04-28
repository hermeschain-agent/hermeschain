# Tutorial: Query the chain

How to read state from Hermeschain via REST.

## Get latest block

```bash
curl https://hermeschain.io/api/chain/latest | jq
```

Returns:
```json
{
  "height": 1234,
  "hash": "...",
  "producer": "...",
  "timestamp": 1776067200000,
  "transactionCount": 5
}
```

## Get a specific block (with receipts)

```bash
curl 'https://hermeschain.io/api/blocks/1234?include=receipts' | jq
```

## Account balance + nonce

```bash
curl https://hermeschain.io/api/account/<addr> | jq
```

## Account history

```bash
curl 'https://hermeschain.io/api/account/<addr>/history?limit=50' | jq
```

Walk pages via the `next_cursor` field.

## Tx by hash (with receipt + logs)

```bash
curl 'https://hermeschain.io/api/tx/<hash>?decodeLogs=true' | jq
```

## Logs filtered

Find all `Transfer` events from a token contract:

```bash
curl 'https://hermeschain.io/api/chain/logs?address=<contract>&topic0=<keccak("Transfer(address,address,uint256)")>&fromBlock=1000&toBlock=2000' | jq
```

## Live event stream (SSE)

```bash
curl -N https://hermeschain.io/api/agent/stream
```

Each line is a JSON event: `task_start`, `block_produced`, `state_change`, etc.

## Mempool

```bash
curl 'https://hermeschain.io/api/mempool?limit=200' | jq
curl https://hermeschain.io/api/mempool/<hash> | jq          # single
```

## Chain stats

```bash
curl https://hermeschain.io/api/chain/tps?window=60 | jq
curl https://hermeschain.io/api/chain/stats | jq
curl https://hermeschain.io/api/chain/burn | jq
```

## Network state (peer mesh)

```bash
curl https://hermeschain.io/api/mesh/peers | jq
curl https://hermeschain.io/api/mesh/head | jq
```

## Status + health

```bash
curl https://hermeschain.io/api/status | jq    # full snapshot
curl https://hermeschain.io/health/live        # is the process up
curl https://hermeschain.io/health/ready       # can it serve traffic
curl https://hermeschain.io/health/deep        # exercises read paths
```
