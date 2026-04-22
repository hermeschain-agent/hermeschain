# Database Migration Runner

**Task:** phase-08 / migrations / step-1 (design)
**Scope:** `backend/src/database/`

## Current state

One `createTables` function, hand-written, idempotent. Works for the initial schema but breaks down once columns change or indexes are added — operators manually drop + recreate.

## Target

Sequential migrations numbered `0001_initial.sql` through `NNNN_description.sql` in `backend/src/database/migrations/`. A runner applies unapplied migrations on boot, records them in a `schema_migrations` tracking table.

## Runner contract

```ts
class MigrationRunner {
  async applyPending(): Promise<MigrationResult[]>;
  async status(): Promise<{ applied: string[]; pending: string[] }>;
}

interface MigrationResult {
  name: string;
  success: boolean;
  durationMs: number;
  error?: string;
}
```

## Migration file shape

```sql
-- 0004_add_tx_index_status_col.sql
-- up:
ALTER TABLE tx_index ADD COLUMN status TEXT NOT NULL DEFAULT 'success';
CREATE INDEX tx_index_status ON tx_index (status, block_height DESC);

-- down:
DROP INDEX tx_index_status;
ALTER TABLE tx_index DROP COLUMN status;
```

Two sections separated by `-- down:`. The runner supports forward-only in production; `down` sections exist for local rollback during development.

## Invariants

- Migrations are applied in lexicographic order.
- Each migration runs inside a single transaction.
- `schema_migrations` row is written atomically with the migration.
- If a migration errors, the transaction rolls back and startup halts — never partially-applied schema.

## Locking

In multi-replica deploys, only one process should run migrations. Use `SELECT pg_advisory_lock(HERMES_MIGRATION_LOCK_ID)` at runner start; release on completion. Other replicas wait until the holder finishes, then skip.

## Non-goals

- No data-level migrations in this runner — schema only. Data backfills go through a separate "one-shot task" mechanism.
- No automated generation of `down` sections — author writes both.
