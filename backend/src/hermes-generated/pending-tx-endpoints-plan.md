# Wiring plan: /api/tx/* endpoints

**Task:** phase-02 / pending-visibility / step-3 (wire canonical)
**Depends on:** [pending-tx-summary.ts](pending-tx-summary.ts)

## Routes

### `GET /api/tx/pending`

Query params:
- `from?: string` — filter to one sender address
- `limit?: number` — default 100, max 500

Response:
```json
{
  "pending": [PendingTxSummary, ...],
  "totalPending": 314,
  "nextCursor": "optional-opaque-cursor-for-paging"
}
```

Server sorts by `gasPrice` desc, then `firstSeenMs` asc (same as block-producer ordering, so the list matches "what gets mined next").

### `GET /api/tx/:hash`

Response shape = `TxStatusReport`. If `?include=raw` is set, add a `tx: TransactionV1` field with the full record. If the hash isn't recognized at all, return `{ status: 'unknown', hash }` with a 200 (not 404) — wallets poll this for "not yet propagated" scenarios.

### Implementation sketch (Express)

```ts
app.get('/api/tx/pending', (req, res) => {
  const from = typeof req.query.from === 'string' ? req.query.from : undefined;
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
  const all = txPool.snapshotOrdered('gasPrice');
  const filtered = from ? all.filter((e) => e.tx.from === from) : all;
  const slice = filtered.slice(0, limit);
  res.json({
    pending: slice.map((e) => summarizePendingTx(e.tx, e.firstSeenMs)),
    totalPending: filtered.length,
  });
});

app.get('/api/tx/:hash', (req, res) => {
  const hash = req.params.hash;
  const pool = txPool.getByHash(hash);
  const inclusion = chain.findInclusion(hash);  // { blockHeight, failureReason } | null
  const report = deriveStatus({
    hash,
    inMempool: !!pool,
    includedInBlock: inclusion?.blockHeight ?? null,
    currentHeight: chain.getChainLength(),
    finalityDepth: finalityTracker.depth,
    failureReason: inclusion?.failureReason,
  });
  if (req.query.include === 'raw' && pool) {
    res.json({ ...report, tx: pool.tx });
  } else {
    res.json(report);
  }
});
```

## New pool helpers needed

- `TransactionPool.snapshotOrdered('gasPrice')` — emits `{tx, firstSeenMs}[]` sorted as described.
- `TransactionPool.getByHash(hash)` — O(1) hash lookup.

## New chain helper

- `Chain.findInclusion(hash)` — returns `{blockHeight, failureReason}` or null. Requires a hash-to-block index; populated during block commit.
