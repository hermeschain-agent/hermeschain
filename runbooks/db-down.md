# Runbook: PostgreSQL unreachable

## Symptoms

- Boot fails with `[DB] PostgreSQL connection failed`
- `/health/ready` returns 503 with `{ check: 'pg_pool', reason: 'no idle connections' }`
- All queries error with `connection terminated unexpectedly`
- Worker recovery sweep can't run

## Diagnosis

1. Check Railway PG service status in dashboard
2. `psql $DATABASE_URL -c 'SELECT 1'` from a shell — does it connect?
3. `curl /api/metrics | grep hermes_pg_pool` — pool exhausted?
4. Check Railway PG logs for OOM, disk-full, max-conn

## Mitigation

### If Railway PG is down

- Failover plan: backend has in-memory fallback for reads (writes are silently dropped). Static landing + HUD still serve.
- Restore from latest S3 backup: `npm run restore -- --latest` against a fresh PG instance.

### If pool exhausted

- Bump `PG_POOL_MAX` env temporarily (default 20 → 40)
- Find the leak via `SELECT * FROM pg_stat_activity WHERE state != 'idle'`
- Restart the web service to reset the pool

### If connections dropping

- Likely network blip; node-postgres auto-reconnects per query. Monitor for ~5 min.
- If persistent, restart Railway PG.

## Escalation

If down >15 min: post in #incidents Discord channel with status + ETA.
