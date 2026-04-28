# SQL injection audit playbook (TASK-338)

Run `backend/scripts/audit-sql-injection.ts` weekly. Greps for `db.query` callsites with template strings or string concat. Manual review for false positives (e.g. table names that come from a hardcoded list).
