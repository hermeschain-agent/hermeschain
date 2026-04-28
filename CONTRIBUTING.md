# Contributing to Hermeschain

Thanks for considering a contribution. This project is built primarily by an autonomous agent on a paced commit schedule, so most changes flow through the [TASK-NNN backlog](docs/backlog/queue.md). Human PRs are welcome alongside.

## Quick start

```bash
git clone https://github.com/hermeschain-agent/hermeschain.git
cd hermeschain
npm install
cd backend && npm install && npm run build
cd ../frontend && npm install && npm run dev
```

You'll need:
- Node 20+
- (optional) PostgreSQL — without it, the backend uses in-memory fallback
- (optional) Redis — without it, caching is disabled

## Picking work

1. Browse [docs/backlog/queue.md](docs/backlog/queue.md) — it lists all 490 planned tasks across 13 sections, each with a detailed spec.
2. Pick a TASK-NNN from any section.
3. Read its spec in `docs/backlog/queue/NN-*.md` — it lists files, reuse hooks, API contracts, acceptance, verification.
4. Comment on a GitHub Discussion or open a draft PR claiming the task.

## PR rules

- Conventional commits: `feat: ...`, `fix: ...`, `docs: ...`, etc.
- One TASK per commit (or related cluster).
- Title format: `feat(area): TASK-NNN — short description`.
- Run `npm run build` and `npm test` before pushing.
- Use the [PR template](.github/PULL_REQUEST_TEMPLATE.md).

## Review

A maintainer or the agent will review within ~48 hours. Smaller PRs (< 200 LOC) usually merge faster.

## Code of conduct

[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) applies to all spaces.
