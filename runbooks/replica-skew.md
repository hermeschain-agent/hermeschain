# Runbook: Replica state skew

## Symptoms
- Two replicas report different /api/state stateRoot
- Cross-replica SSE events out of order
- Reorg events without recovery

## Diagnosis
- Compare `curl https://A/api/status` and `curl https://B/api/status`
- Inspect Redis: `redis-cli get chain:block_height`
- Check log_subscribers for stale entries

## Mitigation
- Restart trailing replica to force chain.refreshFromDb()
- If skew >10 blocks, escalate to chain-halted runbook
