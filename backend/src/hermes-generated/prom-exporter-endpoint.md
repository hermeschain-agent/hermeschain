# Prometheus Exporter Endpoint

**Task:** phase-08 / prom-exporter / step-1 (design)
**Scope:** `backend/src/api/`

## Route

```
GET /metrics
```

Returns the Prometheus text-format exposition produced by the shared `Registry` (from `metrics-collector.ts`). No authentication — metrics are non-sensitive infrastructure telemetry.

## Standard metrics exposed

```
# Chain
hermes_block_height                      gauge
hermes_block_finalized_height            gauge
hermes_block_production_duration_ms      histogram
hermes_tx_admitted_total                 counter
hermes_tx_rejected_total{reason}         counter
hermes_mempool_pending                   gauge
hermes_reorg_total                       counter

# Consensus
hermes_validator_online_total            gauge
hermes_validator_slashed_total           counter
hermes_checkpoint_progress_basis_points  gauge

# Agent
hermes_agent_token_spend_hour            gauge
hermes_agent_token_spend_day             gauge
hermes_agent_task_duration_ms            histogram
hermes_agent_task_success_total          counter
hermes_agent_task_failure_total{reason}  counter
hermes_agent_circuit_breaker_open        gauge

# API
hermes_api_requests_total{route,status}  counter
hermes_api_request_duration_ms{route}    histogram
hermes_api_ratelimit_blocked_total       counter
```

## Label hygiene

Keep cardinality under control:
- Route labels use normalized shape (`/api/tx/:hash`, not individual hashes).
- Reason labels are a fixed enum.
- Never label on user-supplied strings (would let a bot blow up the metric store).

## Scrape config

```yaml
scrape_configs:
  - job_name: hermeschain
    scrape_interval: 15s
    static_configs:
      - targets: ['web:4000', 'worker:4001']
```

## Non-goals

- No push-based export — Prometheus's pull model handles everything.
- No Grafana dashboard JSON in this rev; sample queries documented separately.
