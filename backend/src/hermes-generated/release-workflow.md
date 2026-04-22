# Release Workflow

**Task:** phase-08 / release-workflow / step-1 (design)

## Target: `.github/workflows/release.yml`

## Trigger

Pushed tag matching `v*.*.*`. Pattern enforced; anything else is a no-op.

## Jobs

### 1. validate-tag

- Tag matches semver.
- Tag is on `main` (not a feature branch).
- Tag message is non-empty and contains "Release <version>".

### 2. build-artifacts

- `npm ci && npm run build` in both backend/ and frontend/.
- Package backend as `hermeschain-backend-v<X.Y.Z>.tar.gz` (dist + package.json + package-lock.json).
- Package frontend as `hermeschain-frontend-v<X.Y.Z>.tar.gz`.

### 3. publish-npm (packages only)

- `@hermeschain/sdk` — if `sdk/package.json` version matches the tag.
- `@hermeschain/cli` — same.

Skipped if the package versions don't match the release tag (i.e., the release doesn't touch them).

### 4. github-release

- Creates the GitHub Release from the tag.
- Attaches the tarballs from step 2.
- Release body: auto-generated from commit messages since the previous tag, grouped by conventional-commit type.

### 5. docker-images

- `docker buildx build` multi-arch (amd64 + arm64).
- Tagged `ghcr.io/hermeschain-agent/hermeschain-backend:v<X.Y.Z>` and `:latest`.
- Push to GHCR (needs `GHCR_TOKEN`).

### 6. announce

- Posts a structured changelog summary to the `#releases` Discord channel via webhook.
- Only runs on non-draft releases.

## Rollback

A release tag is immutable. To revert a bad release:

1. Tag the previous good commit as `v<X.Y.Z>-hotfix.1`.
2. Re-run release.yml against the hotfix tag.
3. Operators `docker pull :v<X.Y.Z>-hotfix.1` and redeploy.

Never delete a released tag; always move forward.

## Non-goals

- No auto-generated changelog reformatting beyond the conventional-commit grouping. Authors write good messages; release notes are just aggregated.
- No signed tags in this rev (GPG setup) — revisit after a first release cycle if provenance matters.
