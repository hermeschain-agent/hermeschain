# Script: migrate-down

`backend/scripts/migrate-down.js` (or .ts)

## Purpose
Rolls back a single applied migration by NNNN prefix. Refuses prod runs without FORCE_PROD_DOWN=1.

## Invocation
`npm run migrate:down`
