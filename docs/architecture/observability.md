# Observability stack

| Layer | Source | Sink |
|---|---|---|
| Structured access log | accessLog middleware | stdout NDJSON → Logflare/Axiom |
| Slow request log | accessLog (slow:true) | console.warn → alerting |
| PG query histogram | queryMetrics | /api/metrics → Prometheus → Grafana |
| Chain-level metrics | server.ts /api/metrics | Prometheus → Grafana |
| Errors | sentry middleware | Sentry → on-call |
| Audit trail | api_key_audit, suspicious_events tables | Database → /api/security/* endpoints |
| Pacer events | PacedPusher console.log | stdout → Railway logs |
