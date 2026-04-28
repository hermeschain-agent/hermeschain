# Table: address_tags

Defined in `backend/src/database/schema.ts` and/or via NNNN migration.

## Indexes
See migration files in backend/src/database/migrations/.

## Common queries
- Lookup by primary key — index-only.
- Range scans — see compound indexes per table.

## Lifecycle
Per-user CRUD. Drop on api-key revocation.
