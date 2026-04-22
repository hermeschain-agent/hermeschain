# Grafana Dashboard — Sample Queries

**Task:** phase-08 / grafana / step-1 (docs)

Reference queries for the `hermeschain-overview.json` dashboard. Panels are keyed to the metrics exposed at `/metrics`.

## Chain health

- **Block height**:
  `hermes_block_height`
- **Blocks per minute**:
  `rate(hermes_block_height[1m]) * 60`
- **Finalization lag** (head - finalized):
  `hermes_block_height - hermes_block_finalized_height`
- **Block production p95**:
  `histogram_quantile(0.95, rate(hermes_block_production_duration_ms_bucket[5m]))`

## Mempool

- **Pending count**:
  `hermes_mempool_pending`
- **Rejection reasons (last hour)**:
  `sum by (reason) (rate(hermes_tx_rejected_total[1h]))`
- **Admit / reject ratio**:
  `rate(hermes_tx_admitted_total[5m]) / (rate(hermes_tx_admitted_total[5m]) + rate(hermes_tx_rejected_total[5m]))`

## Agent

- **Token spend this hour**:
  `hermes_agent_token_spend_hour`
- **Daily spend %**:
  `hermes_agent_token_spend_day / 500000 * 100`  (hardcoded cap; parametrize per env)
- **Task success rate (last 24h)**:
  `rate(hermes_agent_task_success_total[24h]) / (rate(hermes_agent_task_success_total[24h]) + sum(rate(hermes_agent_task_failure_total[24h])))`
- **Circuit breaker state**:
  `hermes_agent_circuit_breaker_open`  (alert on == 1)

## API

- **Request rate per route**:
  `sum by (route) (rate(hermes_api_requests_total[1m]))`
- **P99 latency per route**:
  `histogram_quantile(0.99, sum by (route, le) (rate(hermes_api_request_duration_ms_bucket[5m])))`
- **Rate-limit blocked (last 10m)**:
  `rate(hermes_api_ratelimit_blocked_total[10m])`

## Consensus

- **Validators online vs total**:
  `hermes_validator_online_total / hermes_validator_total`
- **Slashing events this week**:
  `increase(hermes_validator_slashed_total[7d])`
- **Checkpoint progress (0–10000 bp)**:
  `hermes_checkpoint_progress_basis_points / 100`  (render as %)

## Alert thresholds

| Condition | Severity |
| --- | --- |
| `rate(hermes_block_height[5m]) == 0` for > 2m | P0 (chain stalled) |
| `hermes_agent_circuit_breaker_open == 1` | P1 (agent halted) |
| `hermes_agent_token_spend_day > 400000` | P2 (80% of cap) |
| `hermes_mempool_pending > 5000` | P2 (congestion) |
| `rate(hermes_api_ratelimit_blocked_total[5m]) > 50` | P3 (possible abuse) |
