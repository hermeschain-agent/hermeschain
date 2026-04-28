# PagerDuty Integration

How to wire Hermeschain alerts into PagerDuty for on-call.

## Service mapping

Create one PagerDuty service per concern:

| Service | Severity | Source | Routing |
|---|---|---|---|
| hermes-chain | Critical | Prometheus alert: chain stalled >5min | All on-call |
| hermes-api | High | LB 5xx rate >1% | Backend on-call |
| hermes-db | High | PG connection failure / pool exhausted | Infra on-call |
| hermes-agent | Medium | Agent stuck (no commits >2h) | Async (issue, no page) |
| hermes-mesh | Medium | Peer mesh fewer than 2 active | Async |

## Integration

### Via Prometheus Alertmanager

```yaml
# alertmanager.yml
route:
  receiver: pagerduty-default
  routes:
    - match: { service: hermes-chain }
      receiver: pagerduty-chain
    - match: { service: hermes-api }
      receiver: pagerduty-api

receivers:
  - name: pagerduty-chain
    pagerduty_configs:
      - service_key: <PAGERDUTY_INTEGRATION_KEY_CHAIN>
  - name: pagerduty-api
    pagerduty_configs:
      - service_key: <PAGERDUTY_INTEGRATION_KEY_API>
```

### Via direct webhook

```bash
curl -X POST https://events.pagerduty.com/v2/enqueue \
  -H 'Content-Type: application/json' \
  -d '{
    "routing_key": "<INTEGRATION_KEY>",
    "event_action": "trigger",
    "payload": {
      "summary": "Hermeschain chain stalled",
      "severity": "critical",
      "source": "hermeschain-prod"
    }
  }'
```

## Escalation policy

- **Page**: notify primary on-call
- **No-ack 5 min**: escalate to secondary
- **No-ack 15 min**: escalate to tertiary + Slack #incidents

## Linked runbooks

Each PD alert should reference the matching runbook:

- chain stalled → `runbooks/chain-halted.md`
- DB unreachable → `runbooks/db-down.md`
- agent stuck → `runbooks/agent-stuck.md`
- peer mesh partition → `runbooks/peer-partition.md`
- disk full → `runbooks/disk-full.md`
