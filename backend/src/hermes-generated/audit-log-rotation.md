# Audit Log Rotation

**Task:** phase-08 / audit-log / step-1 (design)
**Scope:** `backend/src/ops/`

## What goes in the audit log

Privileged or otherwise-irreversible operator actions:
- API key created / revoked.
- Validator removed (slashing claim).
- Treasury payout executed.
- Migration / one-shot task run.
- Manual chain rollback (extreme).

What does **not** go in: every API request, every block, every tx. Those have their own log streams with much higher volume and lower per-entry value.

## Format

JSON-per-line in `audit-YYYY-MM-DD.log` files under `/var/log/hermeschain/`. One file per UTC day.

```json
{
  "ts": "2026-04-22T14:33:21.412Z",
  "actor": "operator:alex@hermeschain.xyz",
  "kind": "api_key_revoked",
  "subject": "pk_live_abcd1234",
  "reason": "abuse",
  "metadata": { "requests_per_min_at_revoke": 50000 }
}
```

## Rotation

- Daily file rollover at UTC midnight.
- Files older than 90 days are gzipped.
- Files older than 7 years are deleted (legal retention bound).
- All rotation is `logrotate`-driven; no application code involved.

## Tamper resistance

Each line carries a chained `prevLineHash` field — sha256 of the previous line. Removing or modifying a line breaks the chain at that point. Not cryptographic-grade tamper-proof (an attacker with file write can recompute the chain), but flags casual tampering.

## Querying

Operators read directly from disk via `tail -f` or grep. A future workstream may ship a CLI subcommand `hermes audit query` for filtered access.

## Non-goals

- No external SIEM integration in this rev (file-based is sufficient at this scale).
- No real-time alerting on audit events — those go through Prometheus + Grafana, not the audit log.
