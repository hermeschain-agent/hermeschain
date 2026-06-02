# Script: backup-db

`backend/scripts/backup-db.js` (or .ts)

## Purpose
Runs pg_dump | gzip | upload-to-S3. Optional --prune deletes objects older than BACKUP_RETAIN_DAYS.

## Invocation
`npm run backup:db`
