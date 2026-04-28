# Script: restore-db

`backend/scripts/restore-db.js` (or .ts)

## Purpose
Downloads + restores S3 backup into RESTORE_DATABASE_URL. Refuses to overwrite primary unless --force.

## Invocation
`npm run restore:db`
