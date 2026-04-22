# Secret Rotation Runbook

**Task:** phase-08 / secret-rotation / step-1 (docs)
**Scope:** operations

## Secrets tracked

| Secret | Where | Rotation cadence | Rotation owner |
| --- | --- | --- | --- |
| `ANTHROPIC_API_KEY` | Railway env (worker) | 90 days | Operator |
| `GITHUB_TOKEN` | Railway env (worker) | 90 days | Operator |
| `SESSION_SECRET` | Railway env (web) | 180 days | Operator |
| `DATABASE_URL` | Railway env (web+worker) | on compromise only | Platform |
| Validator signing keys | on-chain validator registration | per `KEY_ROTATION_BLOCKS` schedule | Validator node |

## Rotation procedure — API keys

1. Generate new key in provider dashboard (Anthropic, GitHub).
2. `railway variables --service hermeschain-worker --set ANTHROPIC_API_KEY=<new>`.
3. Wait for redeploy; `railway logs --service hermeschain-worker` should show a successful Anthropic call within 5 min.
4. Revoke old key in provider dashboard.

No service downtime expected — Railway redeploys rolling.

## Rotation procedure — SESSION_SECRET

Changing invalidates all existing sessions (users must re-auth).

1. `railway variables --service hermeschain --set SESSION_SECRET=<new random hex>`.
2. Announce the re-auth requirement 24h ahead if users are active.

## Rotation procedure — Validator keys

Consensus-coordinated. Out of scope for this document — see [consensus/key-rotation.md] (future).

## Compromise response

If any secret is believed compromised:
1. Rotate immediately (skip the scheduled cadence).
2. Audit logs for unauthorized use since the last known-good state.
3. If authorized-use can't be confirmed for any timestamp, treat the window as potentially malicious and review what could have been done with that access (`GITHUB_TOKEN` compromise → check pushed commits for tampering).

## Recording

Every rotation event is logged to the internal ops channel with:
- Secret name
- Date/time of rotation
- Reason (scheduled | compromise | other)
- Operator name

Not logged: the secret values themselves.
