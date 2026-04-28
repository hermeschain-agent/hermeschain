# Services

| Service | Role | Code |
|---|---|---|
| hermeschain (web) | Public API + HUD + SSE | server.ts (AGENT_ROLE=web) |
| hermeschain-worker | BlockProducer + AgentWorker + PacedPusher | server.ts (AGENT_ROLE=worker) |
| Postgres | Persistent state | DATABASE_URL |
| Redis | Cache + pub/sub bridge + leader lease | REDIS_URL |
| Anthropic API | LLM for chat + AI validation | ANTHROPIC_API_KEY |
| GitHub | Source of truth + CI + paced commit destination | GITHUB_TOKEN |
