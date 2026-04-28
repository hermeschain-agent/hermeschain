# Changelog

All notable changes to Hermeschain. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [SemVer](https://semver.org/).

## [Unreleased]

### Added (Tier-3 implementation pass — first sweep)

- Multi-validator consensus: rotating producer + 2/3 quorum (TASK-013, TASK-014, TASK-010)
- Network peer mesh: PeerRegistry + `/api/mesh/*` routes + bootstrap heartbeat (TASK-005)
- VM JSON-op interpreter with dynamic gas + real receipt logs (TASK-061..065)
- CIMonitor file-watch with 5s debounce (TASK-O)
- Block.fromJSON deserializer + gossip-apply via `/api/mesh/block` (TASK-001, TASK-002)
- Header-only sync + bulk block fetch endpoints (TASK-003, TASK-004)
- Block timestamp drift + min-time validation (TASK-015, TASK-016)
- Mempool TTL + size cap + replacement-by-fee (TASK-019, TASK-020, TASK-021)
- Block size limit (1MB serialized) (TASK-022)
- Idempotent tx submit, mempool snapshot/by-hash, next-nonce hint (TASK-057, TASK-166, TASK-167, TASK-170)
- Per-validator block reward (env-tunable) (TASK-039)
- TPS endpoint + chain stats (TASK-051)
- Address validity checker + block search (TASK-137, TASK-153)
- 14 DB migrations (indexes, tables for slashing/contract code/storage/metadata/snapshots/peers/newsletter) (TASK-306..318, 0015)
- PG pool tuning + query histogram + slow-query log + `db.poolStats()` (TASK-319, TASK-320, TASK-321)
- pg_dump → S3 backup + restore + smoke check (TASK-323, TASK-324)
- migrate:down / migrate:status --dry-run / schema-diff CLIs (TASK-325, TASK-326, TASK-327)
- Redis cache warmer at boot + Redis pub/sub bridge for cross-replica events (TASK-328, TASK-330)
- SSE replica pinning + worker leader election (TASK-331, TASK-332)
- TypeScript SDK skeleton (`@hermeschain/sdk`) (TASK-273, TASK-274, TASK-276)
- Three-tier health checks + Prometheus `/api/metrics` + `/api/build` (TASK-149, TASK-150, TASK-152)
- Request-ID + NDJSON access log + slow-request log middleware (TASK-146, TASK-147, TASK-148)
- CORS allowlist + JSON body size cap + HTTPS redirect (TASK-145, TASK-340, TASK-360)
- Backend Sentry integration (lazy-loaded) (TASK-444)
- Newsletter signup endpoint (TASK-486)
- Counter example contract + first-contract + query tutorials (TASK-105, TASK-290, TASK-292)
- Glossary + FAQ + Roadmap + Contributing + Code of Conduct (TASK-295..300)
- Threat model + bug bounty + admin-token rotation + cert pinning + disclosure response (TASK-301, TASK-303, TASK-346, TASK-369, TASK-370)
- Five operator runbooks (db-down, agent-stuck, chain-halted, peer-partition, disk-full) (TASK-461..465)
- Multi-region deploy notes + PagerDuty mapping + Prometheus alert rules + Grafana dashboard (TASK-457, TASK-459, TASK-460, TASK-470)
- GitHub Actions: gitleaks, npm audit, CodeQL, full CI workflow (TASK-354, TASK-355, TASK-356, TASK-410)
- Issue templates + PR template + Dependabot + commitlint config (TASK-415, TASK-417, TASK-482, TASK-483)
- Prettier + Makefile + justfile + .nvmrc + .env.example + docker-compose (TASK-412, TASK-422, TASK-423, TASK-425, TASK-426, TASK-427)
- security.txt + robots.txt + RSS feed generator (TASK-302, TASK-438, TASK-485)
- Vanity address + bulk-keys generator scripts + Redis TTL audit (TASK-138, TASK-139, TASK-329)
- 490 task specs across 13 section files in `docs/backlog/queue/`

### Fixed

- GitHub link in HUD header (`hermeschain-dev` → `hermeschain-agent`)

### Infrastructure

- `paced-push.js` script — promotes commits from `tier-3-backlog` to `main` at controlled cadence (default 60/day)

## [v0.2.0] — 2026-04-26 (Tier-2 closure)

Tier-2 feature holes shipped. ForkManager wired into Chain.addBlock; tx
hash + account alias endpoints; DB migration runner; SSE event coverage;
`/api/hermes/chat` alias; `AUTO_GIT_PUSH` defaults true with
`GITHUB_TOKEN` present.

## [v0.1.0] — 2026-04-25 (Tier-1 closure)

Tier-1 security holes closed. Sign-verify on `POST /wallet/send`; admin-
gated `POST /auth/keys`; state rollback + mempool eviction on reorg;
persistent receipts.

[Unreleased]: https://github.com/hermeschain-agent/hermeschain/compare/v0.2.0...HEAD
[v0.2.0]: https://github.com/hermeschain-agent/hermeschain/compare/v0.1.0...v0.2.0
[v0.1.0]: https://github.com/hermeschain-agent/hermeschain/releases/tag/v0.1.0
