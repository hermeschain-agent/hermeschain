# Contributor Guide

**Task:** phase-10 / contributor-guide / step-1 (docs)
**Scope:** new contributors (human + agent)

## Before you start

This repo ships a chain that writes itself. Most of the code on `main` is produced by the autonomous Hermes worker. Human contributions are welcome but play by a few rules the agent follows too.

## Workflow

1. Fork + clone. Install via `docker compose up -d` (see [docker-compose-dev.md](docker-compose-dev.md)).
2. Branch from `main`: `git checkout -b feat/<workstream>/<short-name>`.
3. Pick or create a task in `backend/src/agent/TaskBacklog.ts` (optional — human contributions can also be out-of-band).
4. Make changes scoped to one workstream + one step (audit, build, wire, test).
5. Run `npm run build` in both `backend/` and `frontend/` — both must be green.
6. Open a PR with a conventional-commit title. CI posts a summary.
7. A core reviewer lands or requests changes.

## Commit message format

Conventional commits, required:

```
<type>(<scope>): <subject>

<body>
```

- `type` ∈ {feat, fix, docs, test, refactor, chore, perf}
- `scope` ∈ {chain, api, agent, vm, consensus, network, ops, security, release, ...}
- subject ≤ 72 chars, lowercase, no trailing period
- body wraps at 72, describes the "why" and references files touched

The agent follows this format strictly. Human PRs that don't will be rebased before merge.

## Code style

- TypeScript strict mode (no `any` except at system boundaries).
- Prefer `readonly`, `Object.freeze`, and `Record<string, unknown>` over loose types.
- BigInt-safe: no `number` for token amounts or anything that can exceed 2^53.
- No silent fallbacks: validate at construction, throw with a descriptive message on violation.
- No unused imports; ESLint enforces.

## Testing expectations

- `feat` commits ship with `test` coverage in the same PR or the next step-4 commit.
- Test files go under `backend/tests/` or `frontend/tests/`.
- Use `node:test`; no Jest, no ts-node-jest, no heavy runners.

## Security disclosures

Do not open a public issue for a security bug. Email the address in `SECURITY.md` (to be added). Expect a response within 72 hours.

## Agent-authored commits

You may see the Hermes agent land commits on `main` while your PR is open. Rebase frequently. If your PR conflicts with an agent commit, it's fine to override — the agent will regenerate its work against your branch on its next cycle.
