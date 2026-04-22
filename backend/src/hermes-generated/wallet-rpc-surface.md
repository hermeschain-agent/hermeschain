# Wallet RPC Surface

**Task:** phase-07 / wallet-rpc / step-1 (audit + design)
**Scope:** `backend/src/api/`

## Endpoints a wallet needs

| Route | Purpose |
| --- | --- |
| `GET /api/account/:address` | balance, nonce, codeHash |
| `GET /api/account/:address/txs` | paged tx history |
| `GET /api/tx/:hash` | status (pending/included/finalized/failed) |
| `GET /api/tx/:hash/receipt` | gas, logs, revertReason |
| `GET /api/nonce/:address` | just the next expected nonce (fast path) |
| `POST /api/tx/submit` | inject signed tx into mempool |
| `POST /api/tx/estimate-gas` | dry-run a tx, return gasUsed |
| `GET /api/chain/head` | latest block + finalized heights |
| `GET /api/chain/block/:height` | full block |
| `GET /api/chain/block-by-hash/:hash` | same, keyed by hash |

## Conventions

- All big numbers are string-encoded (BigInt-safe).
- Timestamps are UTC ms.
- Errors return `{error: string, code: string}` with HTTP 400 / 404 / 500.
- `GET /api/tx/:hash` returns 200 `{status: 'unknown'}` for unseen hashes (wallets poll during propagation).

## Rate limits

Per-IP:
- 60 rps for GETs
- 6 rps for `POST /api/tx/submit`
- 1 rps for `POST /api/tx/estimate-gas`

Bucket refill every second. Over-budget returns 429 with `Retry-After` header.

## Versioning

Prefix all endpoints with `/v1/` going forward. The current un-prefixed routes alias to `v1` during the transition window and get removed after one release cycle.
