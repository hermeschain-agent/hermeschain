# Environment variable index

Master list lives in .env.example. This doc is a categorical index for ops triage.

## Required (web + worker)
- ANTHROPIC_API_KEY
- DATABASE_URL (or in-memory fallback ok in dev)

## Required (worker only)
- AGENT_ROLE=worker
- GITHUB_TOKEN (for AUTO_GIT_PUSH)
- GITHUB_REPO

## Pacer (worker)
- PACED_PUSH_ENABLED=true
- PUSH_INTERVAL_MS, PUSH_BATCH, PUSH_BRANCH, PUSH_TARGET, PUSH_REMOTE
- POINTER_FILE

## Observability
- SENTRY_DSN (optional)
- ACCESS_LOG_ENABLED, SLOW_REQUEST_MS, PG_SLOW_QUERY_MS

## Security
- ADMIN_TOKEN
- CORS_ORIGINS
- JSON_BODY_LIMIT (default 1mb)
- HCAPTCHA_SECRET (faucet)

## Block production
- HERMES_BLOCK_REWARD_WEI

## Mesh
- HERMES_PEER_ID, HERMES_PUBLIC_URL, HERMES_PUBLIC_KEY
- HERMES_BOOTSTRAP_PEERS

## SSE
- SSE_REPLICA, SSE_REPLICA_STRICT
