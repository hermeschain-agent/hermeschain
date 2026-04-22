# Docker Compose Dev Environment

**Task:** phase-09 / dev-setup / step-1 (docs)
**Scope:** repo root (future `docker-compose.yml`)

## Services

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: hermeschain
      POSTGRES_USER: hermeschain
      POSTGRES_PASSWORD: dev
    ports: ['5432:5432']
    volumes: ['pgdata:/var/lib/postgresql/data']

  redis:
    image: redis:7-alpine
    ports: ['6379:6379']

  node:
    build: ./backend
    environment:
      DATABASE_URL: postgres://hermeschain:dev@postgres:5432/hermeschain
      REDIS_URL: redis://redis:6379
      AGENT_MODE: demo
      HERMES_MODEL: claude-haiku-4-5-20251001
    ports: ['4000:4000']
    depends_on: [postgres, redis]

  web:
    build: ./frontend
    environment:
      VITE_API_BASE: http://localhost:4000
    ports: ['5173:5173']
    depends_on: [node]

volumes:
  pgdata:
```

## Usage

```
docker compose up -d          # start everything
docker compose logs -f node   # tail backend
docker compose exec node sh   # shell into backend
docker compose down -v        # stop + wipe volumes
```

## Env overrides

Create `.env.local` at repo root; docker-compose reads it automatically. Common overrides:

- `ANTHROPIC_API_KEY` — for live agent work (leave unset for demo mode).
- `AGENT_AUTORUN=true` — activate the worker loop in dev.
- `BLOCK_INTERVAL_MS=2000` — faster blocks for local testing.

## Target: one-command dev

After clone:
```
git clone <repo>
cd hermeschain
cp .env.example .env.local
docker compose up -d
open http://localhost:5173
```

No local Node / npm install required. Everything runs in containers.
