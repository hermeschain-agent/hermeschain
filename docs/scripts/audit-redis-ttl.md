# Script: audit-redis-ttl

`backend/scripts/audit-redis-ttl.js` (or .ts)

## Purpose
Greps backend/src/ for cache.set/setJSON/hset without TTL. Exits 1 on findings.

## Invocation
`npm run audit:redis:ttl`
