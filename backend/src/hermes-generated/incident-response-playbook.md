# Incident Response Playbook

**Task:** phase-08 / incident-response / step-1 (docs)
**Scope:** operations

A short, action-oriented runbook for common incidents. Meant to be the first thing a responding operator reads.

## 1. Agent stops committing

Symptoms: no new commits on `main` for > 1 hour.

Checks:
- `/api/agent/status` → `tokenSpend.paused`? If yes, budget tripped — wait for window reset or raise cap.
- Railway service `hermeschain-worker` running? If crashed, `railway logs --service hermeschain-worker` for stack.
- `circuitBreakerUntil` in logs? Billing / auth error — check Anthropic dashboard for credit balance.
- Git push failing? `GITHUB_TOKEN` expired — rotate via operator.

## 2. Chain stops advancing

Symptoms: `blockHeight` unchanged for > 2 min.

Checks:
- Validators online? Check `OperatorHealth.validators[*].online`.
- Mempool full? `OperatorHealth.mempool.pending >> 10_000`.
- `BlockProducer` logs — "waiting for proposer turn" suggests validator-selection failure.

Mitigation: restart the producer service. Chain state is durable so restart is safe.

## 3. Consensus failure (blocks rejected by validators)

Symptoms: `consensus_failed` events firing; block height stuck.

Checks:
- Log the first rejected block's reason. Common: stateRoot mismatch, bad signature, chainId mismatch.
- Diff the producer's state root against a peer's state at the same height.

Mitigation: if deterministic disagreement, likely code drift between nodes. Roll both back to consensus ancestor, redeploy the blessed binary.

## 4. Anthropic credit exhausted

Symptoms: `circuit breaker open for Nm` in worker logs.

Mitigation: top up the Anthropic account. Circuit breaker clears itself after 60 min or on worker restart.

## 5. Runaway Railway spend

Symptoms: Railway usage dashboard flags high CPU / egress.

Mitigation: `railway variables --set AGENT_DAILY_TOKEN_CAP=100000` to throttle agent work. If still spending, check for Anthropic-unrelated issues (network gossip storm, log shipping overrun).

## 6. Postgres connection pool exhausted

Symptoms: `could not acquire connection` in API logs.

Mitigation: check `SELECT count(*) FROM pg_stat_activity WHERE datname='hermeschain'`. Kill long-running queries. Raise `DATABASE_POOL_MAX`.

## Escalation

On any incident unresolved in 30 min, notify the on-call operator group. Keep a log of actions taken; attach to the post-mortem.
