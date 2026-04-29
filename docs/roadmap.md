# Roadmap

Public, machine-tracked. Status reflects what's on `main`.

## Tier 1 — Security + visible bugs (DONE)

- [x] Sign-verify on `POST /wallet/send`
- [x] Gate `POST /auth/keys` behind admin token
- [x] State rollback on reorg
- [x] Mempool eviction on reorg
- [x] Persist receipts (no longer in-memory)

## Tier 2 — Feature holes (DONE)

- [x] Wire `ForkManager` into `Chain.addBlock`
- [x] `GET /api/tx/:hash` + `/api/account/:addr` aliases
- [x] DB migration runner
- [x] SSE: orphaned events tee'd in
- [x] `/api/hermes/chat` alias
- [x] `AUTO_GIT_PUSH` defaults true with `GITHUB_TOKEN` present

## Tier 3 — Protocol / multi-node (SHIPPING)

- [x] Multi-validator consensus (rotating producer, 2/3 quorum)
- [x] Network peer mesh (PeerRegistry, /api/mesh/*)
- [x] VM + dynamic gas + real logs (Interpreter, GasMeter, BlockProducer dispatch)
- [x] CIMonitor file-watch with 5s debounce

## Backlog (490 tasks)

See [docs/backlog/queue.md](backlog/queue.md). Each section file holds detailed specs (files, reuse hooks, API contracts, acceptance, verification). Shipping at 60 commits/day via `paced-push.js`.

| Section | Tasks | Status |
|---|---|---|
| 01 chain-consensus | 60 | early implementation |
| 02 vm | 45 | not started |
| 03 wallet | 35 | not started |
| 04 api-explorer | 40 | early implementation |
| 05 agent-worker | 35 | not started |
| 06 frontend-hud | 50 | not started |
| 07 docs-site | 40 | early implementation |
| 08 database-ops | 30 | mostly shipped |
| 09 security | 35 | early implementation |
| 10 testing | 40 | not started |
| 11 dx-tooling | 35 | not started |
| 12 ecosystem | 30 | not started |
| 13 final-polish | 15 | early implementation |

## Beyond 1000 commits

- DSL → VM compiler with first-class IDE support
- Light client (header-only, JS)
- Multi-region active-active deploy
- Full PBFT BFT (currently 2/3 quorum is per-block majority, not Byzantine-safe across rounds)
