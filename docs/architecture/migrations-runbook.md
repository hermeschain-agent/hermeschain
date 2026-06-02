# Migrations runbook

## Apply pending
`npm run migrate:status` — list applied + pending
`npm run migrate:status -- --dry-run` — print SQL each pending would run

## Roll back single migration
`npm run migrate:down NNNN` — runs the down: block + removes from schema_migrations

## In production
- Migrations run automatically at boot via applyPendingMigrations
- Halt-on-first-error is intentional — do not allow partial-apply
- pg_advisory_lock(0x4845524d) coordinates concurrent replicas
- Lock the DB before running down: in prod (FORCE_PROD_DOWN=1 required)
