# API Pagination Contract

**Task:** phase-07 / pagination / step-1 (design)
**Scope:** `backend/src/api/`

## Why one contract

Every listing endpoint (tx history, pending pool, logs, blocks, validators) needs pagination. Without a shared contract, each endpoint invents its own shape and consumers deal with different cursors everywhere.

## Shape

Request:
```
GET /api/<list>?limit=<n>&cursor=<opaque>
```

Response:
```json
{
  "items": [ ... ],
  "nextCursor": "opaque-string-or-null",
  "total": 1523
}
```

## Cursor semantics

Cursors are opaque strings (base64-encoded JSON inside, but consumers shouldn't parse them). They encode: `{ lastKey: string, filterHash: string }`. `filterHash` is a short hash of the query filter — if a consumer changes filters mid-pagination, the cursor becomes invalid and returns HTTP 400.

## `limit` rules

- Default 50.
- Max 500.
- Requests over 500 are silently clamped, not rejected.

## `total` rules

- Exact count for cheap queries (indexed single-column filter).
- Approximate (prefix `~`) for expensive scans: e.g. `"total": "~1523000"`.
- `null` when total is genuinely unknown.

## Ordering

Each endpoint documents its default order; cursor carries the last-key so resuming is O(1) via index seek. No cursor → start at the beginning of the ordered list.

## Consistency

Snapshot isolation: within a single pagination session (same cursor), new rows added after the first request don't appear. A fresh pagination sees them. Prevents duplicate-display when tailing.

## Examples

- `/api/account/<addr>/txs?limit=50` → 50 most-recent txs.
- `/api/logs?address=<a>&topic0=<h>&limit=100` → 100 matching logs.
- `/api/validators?limit=20` → 20 validators by stake desc.
