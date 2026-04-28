# Runbook: Out of disk

## Symptoms

- PG inserts fail with `could not extend file` or `No space left on device`
- Worker crashes mid-write
- `/health/deep` returns 503 with `db: query failed`

## Diagnosis

1. Railway dashboard: check PG service disk usage %
2. From PG: `SELECT pg_size_pretty(pg_database_size(current_database()))`
3. Largest tables: `SELECT relname, pg_size_pretty(pg_total_relation_size(oid)) FROM pg_class WHERE relkind = 'r' ORDER BY pg_total_relation_size(oid) DESC LIMIT 10`

## Mitigation

### Quick wins

- Truncate `dead_letter_tasks` (TASK-334) older than 30d
- Truncate `agent_chat_logs` older than 30d
- Truncate `consensus_events` older than 90d
- Run state pruning sweep (TASK-034)

### Medium-term

- Bump Railway PG plan (more disk)
- Take a fresh state snapshot (TASK-035) and prune blocks older than the snapshot height + finality depth

### Long-term

- Implement state pruning policy
- Move snapshot blobs out of PG into S3

## Escalation

If PG fills entirely: backups can no longer be taken. Get more disk
provisioned ASAP. This is a tier-1 production incident.
