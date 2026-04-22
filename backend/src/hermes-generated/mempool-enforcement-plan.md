# Wiring plan: MempoolPolicy enforcement

**Task:** phase-02 / mempool-rules / step-3 (wire canonical)
**Depends on:** [mempool-policy.ts](mempool-policy.ts)

## Admission path

`TransactionPool.accept(tx: TransactionV1)` flow under policy:

```
1. Fast shape check (TransactionV1 validate)
2. Replay gate (NonceWindow + SeenTxSet — already in place)
3. Per-sender cap:
     if countBySender(tx.from) >= policy.maxPerSender → reject
4. Capacity:
     if pool.size >= policy.maxSize:
        if policy.onFull === 'drop-new' → reject
        else → evictLowestFee() and continue
5. Admit with { firstSeenMs: Date.now(), ... }
```

## Eviction — `evictLowestFee()`

Walk the pool once, track the min-fee entry. If the incoming tx's
gasPrice > min entry's gasPrice → drop min entry, insert new. Else
reject new. O(n) per insertion; fine at 10k entries.

## TTL sweeper

A 30s interval calls `sweepStale()`:
- For each entry: if `isStale(firstSeenMs, policy)` → remove.
- Emit `[MEMPOOL] swept N stale tx(s)` when count > 0.

Running every 30s means the maximum linger past TTL is 30s — acceptable.

## Ordering for block production

`BlockProducer.pickBatch(n)` reads `policy.orderBy`:
- `'gasPrice'` → sort descending by gasPrice then ascending by firstSeenMs (tiebreak).
- `'insertion'` → sort ascending by firstSeenMs only.

## Metrics to expose on `/api/agent/status`

- `mempool.pending` (count)
- `mempool.oldestAgeMs`
- `mempool.droppedLastHour.capacity`
- `mempool.droppedLastHour.ttl`

These feed the OperatorHealth struct added in the previous workstream.
