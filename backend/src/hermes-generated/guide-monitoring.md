# Guide: Monitor a Node

**Task:** phase-10 / guide / step-3 (docs)

## What to monitor

1. **Chain health** — is my node keeping up?
2. **Consensus participation** — am I proposing + attesting on schedule?
3. **Resource usage** — CPU / memory / disk / network.
4. **Economic state** — stake level, accrued rewards, any slashing.

## Minimum stack

- Prometheus (scrape `/metrics`).
- Grafana (render dashboards — sample queries in `grafana-dashboard-queries.md`).
- Alertmanager or a cheap alternative (simple webhook to Discord works for small-scale).

## Dashboard panels (must-have)

| Panel | Metric | Alert |
| --- | --- | --- |
| Block height | `hermes_block_height` | flat for >2m → P0 |
| Head lag | `max(peer_heights) - local_height` | >3 for >1m → P1 |
| Missed slots | `rate(hermes_missed_slots_total[5m])` | >0.1 → P1 |
| Slashed total | `hermes_validator_slashed_total{self}` | any increase → P0 |
| CPU | `process_cpu_seconds_total` | >90% sustained → P2 |
| Disk usage | `node_filesystem_avail_bytes` | <10% → P2 |
| Network drops | `hermes_peer_dropped_total` | rate spike → P3 |

## Alert routing

- P0 (chain / slashing): wake someone up.
- P1 (degraded): email + Slack during business hours.
- P2 (capacity): ticket for next business day.
- P3 (info): dashboard only.

## Log aggregation

Ship the JSON logger's output to a log store (Loki, CloudWatch Logs, self-hosted vector). Keep:
- Error-level and above for 90 days.
- Info-level for 14 days.
- Debug-level only during incident response (enable via `LOG_LEVEL=debug` env).

## Runbook links

Wire each alert to a section in the [incident-response playbook](./incident-response.md). "Chain stalled" alert → link to its diagnostic flow directly.

## Non-goals

- No opinionated choice between self-hosted and managed observability — depends on your ops posture.
- No out-of-the-box Grafana JSON — template panels live in the repo, but dashboards are per-operator.
