# Runbook: Migration runner failed at boot

## Symptoms
- [MIGRATIONS] X FAILED ... in worker logs
- Boot halts (deliberate — no partial-apply)

## Mitigation
- Inspect failing migration SQL for non-idempotent ops
- Run `npm run migrate:status -- --dry-run` against the DB to see pending
- Apply manual fix via psql, INSERT into schema_migrations, redeploy
- Use `npm run migrate:down NNNN` to roll back if needed
