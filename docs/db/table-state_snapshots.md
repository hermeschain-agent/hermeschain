# Table: state_snapshots

Defined in `backend/src/database/schema.ts` and/or via NNNN migration.

## Indexes
See migration files in backend/src/database/migrations/.

## Common queries
- Lookup by primary key — index-only.
- Range scans — see compound indexes per table.

## Lifecycle
Append-only audit. Retention: 90 days.
