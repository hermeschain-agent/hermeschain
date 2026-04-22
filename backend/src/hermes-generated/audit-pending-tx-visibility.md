# Audit: Pending Transaction Visibility

**Task:** phase-02 / pending-visibility / step-1 (audit)
**Scope:** `backend/src/api/`, `backend/src/blockchain/`

## What consumers need

- **Wallet UI**: after submitting, show the tx's status (pending → included → finalized → failed).
- **Block explorer**: list currently-pending txs with age and fee.
- **Agent / operator**: aggregate pending count + oldest age for the OperatorHealth struct.

## Current state

- No `/api/tx/pending` endpoint.
- No `/api/tx/:hash` endpoint (wallets can't look up a tx by hash at all).
- `TransactionPool` is internal — API layer has no pass-through.

## Endpoints step-2 will specify

| Route | Returns |
| --- | --- |
| `GET /api/tx/pending` | `{ pending: PendingTxSummary[], totalPending: number }` |
| `GET /api/tx/:hash` | `{ status, tx, includedInBlock?, finalizedAtHeight?, failureReason? }` |
| `GET /api/tx/pending?from=<addr>` | scoped to one sender |

## `PendingTxSummary`

```ts
interface PendingTxSummary {
  hash: string;
  from: string;
  to: string;
  amount: string;
  gasPrice: string;
  nonce: number;
  ageMs: number;       // Date.now() - firstSeenMs
  sizeBytes: number;   // canonical-encoded length
}
```

No signatures, no raw bytes — summary only. A follow-up `GET /api/tx/:hash?include=raw` can return the full `TransactionV1`.

## Status enum on `/api/tx/:hash`

```
'pending'    — in the mempool
'included'   — mined but below finality depth
'finalized'  — past finality depth, cannot be reorged
'failed'     — rejected from the mempool (captures the reason)
'unknown'    — never seen
```

Wallets poll this endpoint every 5s after submission.
