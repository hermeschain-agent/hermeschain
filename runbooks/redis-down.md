# Runbook: Redis unreachable

## Symptoms
- chain:block_height stuck (cache persistence broken)
- /health/ready 503 with redis-disconnected
- SSE clients not receiving events

## Mitigation
- Backend has in-memory fallback for cache; events skip the bridge
- chainState becomes per-replica until Redis returns
- Investigate Railway Redis service status
