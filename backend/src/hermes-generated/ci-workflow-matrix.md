# CI Workflow Matrix

**Task:** phase-08 / ci / step-1 (design)

## Target: `.github/workflows/ci.yml`

## Jobs

### `backend-lint`
- `npm ci` in `backend/`
- `npm run lint`
- Fails if any file is unformatted or has a lint error.

### `backend-build`
- `npm ci`
- `npm run build` (tsc)
- Uploads `backend/dist/` as artifact for downstream jobs.

### `backend-test`
- Depends on `backend-build`.
- Downloads the `dist/` artifact.
- Runs `npm test` (node:test).
- Coverage report uploaded to Codecov.

### `backend-fuzz`
- Depends on `backend-build`.
- Runs the fast-check fuzzer at `numRuns: 500`.
- Separate from `backend-test` so a fuzz flake doesn't block fast iteration on unit tests.

### `frontend-build`
- `npm ci` in `frontend/`
- `npm run build` (vite)
- Uploads `frontend/dist/` as artifact.

### `frontend-e2e`
- Depends on `frontend-build`.
- Spins up Postgres + Redis + backend + frontend via docker-compose.
- Runs Playwright tests against localhost:5173.

### `benchmarks`
- Only runs on PRs touching `backend/` or `benchmarks/`.
- Runs per `benchmark-harness.md` spec.
- Posts comparison comment vs main baseline on the PR.

## Triggers

```
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
  schedule:
    - cron: '0 0 * * *'    # nightly fuzz + bench
```

Nightly on main runs the full matrix with `numRuns: 50_000` fuzz + 5-iteration benchmark averaging. Regressions file an issue automatically.

## Non-goals

- No Windows matrix — Node on macOS + Linux covers dev + deploy.
- No pre-release artifact publishing — separate `release.yml` workflow.
