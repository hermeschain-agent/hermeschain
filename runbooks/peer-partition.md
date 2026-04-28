# Runbook: Peer mesh partitioned

## Symptoms

- `/api/mesh/peers` returns fewer peers than expected
- `/api/metrics | grep hermes_peers_active` low
- Different peers report different chain heights
- Mesh `chain_reorg` events spiking

## Diagnosis

1. Check from each peer: `curl /api/mesh/head` — heights aligned?
2. Check our peer list: `curl /api/mesh/peers`
3. Check announce loop on each: logs for `[MESH] announcing to ...`
4. Test connectivity: `curl <peer_url>/api/mesh/head` from one to another

## Mitigation

### If a peer URL changed

- Update `HERMES_BOOTSTRAP_PEERS` env on the affected nodes
- Restart to trigger fresh announce

### If announce calls failing

- Check firewall / network ACLs between peer hosts
- Check `last_seen_ms` in `peers` table — when was the last good announce?

### If chain heads diverged

- Compare via `/api/mesh/headers?from=N&to=M` from each side
- Walk back via TASK-007 reorg-on-sync
- If divergence is below finality depth, sync resolves automatically
- Above finality depth: refuse, investigate why finality was breached

## Escalation

If partition persists >30 min: file TASK-NNN, post to #incidents. Multi-hour
partition risks divergent histories that require manual reconciliation.
