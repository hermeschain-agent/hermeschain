# Docker Healthcheck Contract

**Task:** phase-08 / healthcheck / step-1 (design)

## Routes

### `GET /health/live`

Returns 200 if the process is running. No state checks. Used by the platform (Railway / k8s) to decide when to restart a stuck container.

### `GET /health/ready`

Returns 200 if the service can handle traffic. Checks:
- Postgres connection pool has capacity.
- Redis responds to PING.
- Agent worker (if `AGENT_ROLE=worker`) has a heartbeat within last 90s.
- Chain is at or past the bootstrap height.

Returns 503 otherwise with a JSON body listing failed checks:

```json
{
  "ready": false,
  "failures": [
    { "check": "redis", "reason": "connection refused" },
    { "check": "chain", "reason": "still syncing (height 500/10000)" }
  ]
}
```

### `GET /health/deep`

Like `/ready` but also exercises a full read path (DB SELECT + Redis GET + chain head fetch). Used by external uptime probes; slower.

## Dockerfile integration

```
HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:4000/health/ready || exit 1
```

## Traffic routing

During a rolling deploy:
- Old pod gets SIGTERM.
- Pod's `/ready` starts returning 503 immediately.
- Load balancer stops sending new requests.
- In-flight requests drain (up to 30s timeout).
- Pod exits.
- New pod starts; load balancer waits for its `/ready` to return 200 before routing to it.

## Non-goals

- No graceful "paused" state between live and ready. `/ready` is binary.
- No per-route health (e.g., "API is up but WebSocket is degraded"). Per-route checks belong in Prometheus, not in `/health`.
