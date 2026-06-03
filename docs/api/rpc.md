# Public JSON-RPC Endpoint

Hermeschain exposes a read-only, Ethereum-compatible JSON-RPC endpoint so
MetaMask-style tooling and `eth`-flavored libraries (ethers, web3, viem) can read
chain state directly.

- **URL:** `https://hermeschain.xyz/rpc`
- **Method:** `POST`, JSON-RPC 2.0 (`content-type: application/json`)
- **Chain ID:** `0x1f407` (decimal `128007`) — what `eth_chainId` returns
- **Auth:** none (public, read-only)

> **Addresses are base58, not hex.** Hermeschain uses Solana-style Ed25519
> addresses (e.g. `7Fz…`), so `eth_getBalance`/`eth_getTransactionCount` take the
> base58 address string as `params[0]`, not a `0x` hex address.
>
> **Block timestamps are UNIX seconds** in RPC responses (the eth convention),
> converted from the chain's native milliseconds.

## Writes

`eth_sendRawTransaction` is intentionally **not** supported: Hermeschain
transactions are Ed25519/base58 JSON, not RLP-encoded secp256k1. Submit signed
transactions to `POST /api/transactions` instead (see the API quick tour).

## Methods

| Method | Params | Returns |
|---|---|---|
| `eth_blockNumber` | — | `0xN` real persisted height |
| `eth_chainId` | — | `0x1f407` |
| `net_version` | — | `"128007"` |
| `eth_gasPrice` | — | `0x1` (min gas price) |
| `web3_clientVersion` | — | `"Hermeschain/v1"` |
| `eth_getBalance` | `[address, tag?]` | `0xN` balance in wei |
| `eth_getTransactionCount` | `[address, tag?]` | `0xN` nonce |
| `eth_getBlockByNumber` | `[tag, fullTx]` | block object or `null` |
| `eth_getBlockByHash` | `[hash, fullTx]` | block object or `null` |
| `eth_getTransactionByHash` | `[hash]` | transaction object or `null` |

`tag` accepts `"latest"`, `"earliest"`, or a hex height (`"0x1a"`). `fullTx`
controls whether `transactions` is an array of hashes (`false`) or full objects
(`true`).

## Examples

Current height:

```bash
curl -s https://hermeschain.xyz/rpc \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}'
# → {"jsonrpc":"2.0","id":1,"result":"0x2a"}
```

Chain id:

```bash
curl -s https://hermeschain.xyz/rpc \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
# → {"jsonrpc":"2.0","id":1,"result":"0x1f407"}
```

Latest block (tx hashes only):

```bash
curl -s https://hermeschain.xyz/rpc \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_getBlockByNumber","params":["latest",false]}'
```

Account balance (base58 address):

```bash
curl -s https://hermeschain.xyz/rpc \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_getBalance","params":["<base58-address>"]}'
```

Transaction by hash:

```bash
curl -s https://hermeschain.xyz/rpc \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_getTransactionByHash","params":["<base58-tx-hash>"]}'
```

## Notes

- Unknown methods return JSON-RPC error `-32601` (method not found).
- The endpoint reads the same in-memory chain the HUD and REST API serve, so
  `eth_blockNumber` tracks real block production (~one block / 10s).
