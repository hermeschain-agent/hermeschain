# API Cache Layer

**Task:** phase-07 / caching / step-1 (design)
**Scope:** `backend/src/api/`

## Hot paths

Profile data: /api/agent/status is called by every connected SSE client and every landing-page viewer. /api/chain/head is polled by wallets every 3-5s. /api/account/:addr bursts on account focus.

All three are dominated by read-mostly data that changes at block cadence (~8s). A cache tier that invalidates per block is a huge win.

## Layer

Use the existing Redis deployment (`REDIS_URL` in env) as the shared cache. Keys:

| Key pattern | TTL | Invalidation |
| --- | --- | --- |
| `status:v1` | 2s | per-block hook |
| `head:v1` | 2s | per-block hook |
| `account:<addr>` | 5s | per-block hook |
| `block:<height>` | permanent | never (immutable) |
| `tx:<hash>` | permanent | never |

Short TTL + per-block hook = "fresh within 2s or next block, whichever first."

## Serialization

JSON. Compressed with gzip if value > 4 KB. Key prefix includes a version string so schema changes don't require manual flushes.

## Stampede prevention

On cache miss, the first worker sets a short `lock:<key>` with `SET NX EX 500ms`. Other workers hitting the same miss block on the lock for ≤ 500ms, then re-read cache. Prevents N workers recomputing the same thing simultaneously.

## Bypass path

`?nocache=1` query param skips the read, forces a recompute, and writes the result back to the cache. Useful for debugging stale-data complaints without flushing Redis.

## Non-goals

- No distributed cache invalidation — per-node Redis writes are eventually consistent, and the 2s TTL bounds divergence.
- No write-through for account data — mutations always go to the chain, not the cache.
