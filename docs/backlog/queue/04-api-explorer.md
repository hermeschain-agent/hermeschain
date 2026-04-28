# Section 04 — API & Explorer Specs (TASK-141..180)

40 tasks. OpenAPI/Swagger, versioning, observability middleware (rate-limit headers, request IDs, access log, slow-query log), health subroutes, build/flags/metrics endpoints, search + leaderboards, mempool/reorg/contract feeds, address tagging, WebSocket + Socket.io rooms, GraphQL/tRPC/JSON-RPC compatibility, Postman collection generator.

**Preconditions used throughout:**
- Express server: [backend/src/api/server.ts](backend/src/api/server.ts) — current route mounts at lines 90-700.
- Auth: [backend/src/api/auth.ts](backend/src/api/auth.ts) — `requireApiKey('scope')` middleware, `ipRateLimit(perMin)`.
- Receipts: `loadReceipt()` from [TransactionReceipt.ts:255](backend/src/blockchain/TransactionReceipt.ts#L255).
- DB: `db.query`, `db.queryRead` (TASK-322).
- Mesh: [backend/src/network/api.ts](backend/src/network/api.ts).
- SSE pattern: [server.ts:971-1057](backend/src/api/server.ts#L971-L1057).

---

### TASK-141 — /api/openapi.json generation

**Section:** api
**Effort:** M
**Depends on:** none
**Type:** new-file

**Goal**
Auto-generate OpenAPI 3.1 spec from route declarations so clients can codegen typed SDKs and we get free API docs.

**Files**
- new: `backend/src/api/openapi.ts` — exports `buildOpenApiSpec(): object`.
- edit: `backend/src/api/server.ts` — register `GET /api/openapi.json`.

**Reuses**
- Express's `app._router.stack` for route enumeration.

**API contract**
```
GET /api/openapi.json
→ 200 { openapi: "3.1.0", info, paths: {...}, components: {...} }
```

**Implementation sketch**
- Walk `app._router.stack` and registered routers; emit `paths[route][method]` entries.
- Per-route metadata supplied via a side annotation `routeDoc(route, { summary, params, responses })` collected at registration time.
- Components: shared schemas (Block, Transaction, Receipt) from a single source.

**Acceptance**
- [ ] Returns valid OpenAPI 3.1 (passes `swagger-cli validate`).
- [ ] Every existing route appears.

**Verification**
- `curl /api/openapi.json | swagger-cli validate -`.

---

### TASK-142 — Swagger UI at /docs

**Section:** api
**Effort:** S
**Depends on:** TASK-141
**Type:** edit

**Goal**
Mount swagger-ui-express at `/docs` reading from the openapi.json endpoint.

**Files**
- edit: `backend/src/api/server.ts` — add `swaggerUi.serve` and `swaggerUi.setup`.
- add dep: `swagger-ui-express`.

**Implementation sketch**
- `app.use('/docs', swaggerUi.serve, swaggerUi.setup(undefined, { swaggerOptions: { url: '/api/openapi.json' } }))`.

**Acceptance**
- [ ] `/docs` renders the spec with try-it-out.

**Verification**
- Open `/docs` in browser.

---

### TASK-143 — /api/v1/* version prefix + deprecation headers

**Section:** api
**Effort:** M
**Depends on:** none
**Type:** edit

**Goal**
Stable version 1 prefix. Bare `/api/*` keeps working but returns `Deprecation: true` and `Sunset: <date>` headers.

**Files**
- edit: `backend/src/api/server.ts` — wrap existing app.use calls in helper that mounts at both `/api/v1/...` and `/api/...`; the latter wraps with deprecation middleware.

**Implementation sketch**
- `mountVersioned(app, '/auth', authRouter)` mounts twice; bare path adds the response header.

**Acceptance**
- [ ] `/api/v1/status` works.
- [ ] `/api/status` works AND has `Deprecation: true` header.

**Verification**
- `curl -I /api/status | grep Deprecation`.

---

### TASK-144 — Rate-limit headers (X-RateLimit-*)

**Section:** api
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
[ipRateLimit](backend/src/api/auth.ts) silently rejects with 429. Surface remaining quota in response headers so clients can self-pace.

**Files**
- edit: `backend/src/api/auth.ts:ipRateLimit` — set `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` on every response.

**Acceptance**
- [ ] Headers present on every rate-limited route's response.
- [ ] Remaining decrements per call.

**Verification**
- `curl -i /api/personality/hermes ...`.

---

### TASK-145 — CORS allowlist via env

**Section:** api
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
[server.ts:80](backend/src/api/server.ts#L80) uses `cors()` (open). Restrict to `CORS_ORIGINS` env (comma-separated) when set.

**Files**
- edit: `backend/src/api/server.ts:80`.

**Implementation sketch**
- If env set: `cors({ origin: (origin, cb) => cb(null, allowed.includes(origin)) })`.
- Default unchanged for dev.

**Acceptance**
- [ ] With env, disallowed origin → CORS error.

**Verification**
- Test with curl Origin header.

---

### TASK-146 — Request-ID middleware

**Section:** api
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
Echo or assign `X-Request-ID` header on every request. Used by access log + slow-query log + error reporting for correlation.

**Files**
- new: `backend/src/api/middleware/requestId.ts`.
- edit: `backend/src/api/server.ts` — register before any other middleware.

**Implementation sketch**
- `req.id = req.headers['x-request-id'] || crypto.randomUUID()`.
- `res.setHeader('X-Request-ID', req.id)`.

**Acceptance**
- [ ] Header present on all responses.

**Verification**
- `curl -i /api/status | grep X-Request-ID`.

---

### TASK-147 — Structured access log NDJSON

**Section:** api
**Effort:** S
**Depends on:** TASK-146
**Type:** new-file

**Goal**
One JSON-line per request to stdout: `{ts, method, path, status, durationMs, bytes, requestId, ip}`. Easy to feed into Logflare/Datadog.

**Files**
- new: `backend/src/api/middleware/accessLog.ts`.
- edit: server.ts — register after requestId.

**Implementation sketch**
- On `res.on('finish')`, write the JSON line.

**Acceptance**
- [ ] Every request logged exactly once.

**Verification**
- `curl /api/status` → stdout shows the line.

---

### TASK-148 — Slow-request log >1s

**Section:** api
**Effort:** S
**Depends on:** TASK-147
**Type:** edit

**Goal**
Tag requests over a threshold (default 1s) in the access log with `slow: true` and elevate to console.warn.

**Files**
- edit: accessLog.ts.

**Implementation sketch**
- Threshold env `SLOW_REQUEST_MS` (default 1000).
- If durationMs > threshold: also `console.warn(...)`.

**Acceptance**
- [ ] Slow request appears in console.warn.

**Verification**
- Inject pg_sleep route or call /api/agent/stream briefly.

---

### TASK-149 — /health/live + /health/ready + /health/deep

**Section:** api
**Effort:** M
**Depends on:** none
**Type:** new-file

**Goal**
Three-tier health checks per the design doc. live = process up; ready = can serve traffic; deep = exercises full read paths.

**Files**
- new: `backend/src/api/health.ts`.
- edit: server.ts — mount.

**API contract**
```
GET /health/live → 200 { status: 'live' }
GET /health/ready
  → 200 { ready: true, checks: {...} }
  → 503 { ready: false, failures: [{check, reason}] }
GET /health/deep
  → 200 { ready: true, latencyMs: { db: 12, redis: 3, chainHead: 1 } }
  → 503 { ready: false, failures: [...] }
```

**Implementation sketch**
- `live`: always 200 unless shutting down (graceful-shutdown handler flips a flag).
- `ready`: check `db.poolStats()`, `cache.isConnected()`, agent worker heartbeat (TASK-332), chain bootstrap height.
- `deep`: actually run a SELECT, GET, and chain head fetch with timing.

**Acceptance**
- [ ] All three endpoints return appropriate codes.
- [ ] During shutdown, ready returns 503.

**Verification**
- Curl each.

---

### TASK-150 — /api/build endpoint

**Section:** api
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
Returns build info for debugging deploys: commit SHA, build timestamp, version.

**Files**
- new: `backend/src/api/build.ts`.
- edit: build script — write `backend/build-info.json` with `{ commit: $(git rev-parse HEAD), buildTime: now }`.

**API contract**
```
GET /api/build → 200 { commit, buildTime, version }
```

**Acceptance**
- [ ] Returns commit SHA matching deployed code.

**Verification**
- Compare with `git log` after build.

---

### TASK-151 — /api/flags feature-flag endpoint

**Section:** api
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
Surface the typed feature flag registry already in the codebase. Clients use it for progressive rollout UI.

**Files**
- new: `backend/src/api/flags.ts`.
- edit: server.ts — mount.

**Reuses**
- Existing flag registry (was committed in `feat(ops): typed feature flag registry`).

**API contract**
```
GET /api/flags → 200 { flags: { vmEnabled: true, beaconRandomness: false, ... } }
```

**Acceptance**
- [ ] Lists all flags + current values.

**Verification**
- Curl.

---

### TASK-152 — /api/metrics Prometheus text format

**Section:** api
**Effort:** M
**Depends on:** TASK-319, TASK-320
**Type:** new-file

**Goal**
Standard Prometheus exposition format. Counters + gauges + histograms.

**Files**
- new: `backend/src/api/metrics.ts`.

**Reuses**
- `db.poolStats()` (TASK-319).
- Query histogram from TASK-320.
- Chain stats: `chain.getChainLength()`, mempool size, etc.

**API contract**
```
GET /api/metrics → 200 (text/plain)
   # HELP hermes_chain_height ...
   # TYPE hermes_chain_height gauge
   hermes_chain_height 1234
   ...
```

**Acceptance**
- [ ] Output parses by `prom2json` without errors.
- [ ] Includes pool, query histogram, chain height, mempool size, peer count.

**Verification**
- `curl /api/metrics | prom2json -`.

---

### TASK-153 — Block search by height range with filters

**Section:** api
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
Paginated block listing with height range + producer filter.

**Files**
- new endpoint in server.ts.

**API contract**
```
GET /api/blocks/search?from=&to=&producer=&limit=50&cursor=
→ 200 { items: [...], next_cursor }
```

**Acceptance**
- [ ] Filters apply.
- [ ] Cursor pagination correct.

**Verification**
- Curl with combinations.

---

### TASK-154 — Tx search by from/to/value range

**Section:** api
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
Find txs by sender, recipient, or value range.

**Files**
- new endpoint in server.ts.

**API contract**
```
GET /api/tx/search?from=&to=&minValue=&maxValue=&limit=50&cursor=
→ 200 { items: [...], next_cursor }
```

**Acceptance**
- [ ] Filters apply.

**Verification**
- Curl.

---

### TASK-155 — Top accounts by balance

**Section:** api
**Effort:** S
**Depends on:** TASK-308
**Type:** new-file

**Goal**
Leaderboard endpoint.

**Files**
- new: `GET /api/accounts/top?limit=100`.

**Reuses**
- `idx_accounts_balance_desc` from TASK-308.

**API contract**
```
GET /api/accounts/top?limit=100
→ 200 { items: [{ address, balance, rank }] }
```

**Acceptance**
- [ ] Sorted by balance DESC.

**Verification**
- Curl.

---

### TASK-156 — Top accounts by tx count

**Section:** api
**Effort:** S
**Depends on:** TASK-307
**Type:** new-file

**Goal**
Same shape as TASK-155 but ranked by `(SELECT COUNT(*) FROM transactions WHERE from_address = a.address OR to_address = a.address)`.

**Files**
- new: `GET /api/accounts/top-by-activity?limit=100`.

**Acceptance**
- [ ] Returns count-ranked list.

**Verification**
- Curl.

---

### TASK-157 — Validator leaderboard

**Section:** api
**Effort:** S
**Depends on:** TASK-053
**Type:** new-file

**Goal**
Validators ranked by blocks_produced and uptime.

**Files**
- new: `GET /api/validators/leaderboard`.

**API contract**
```
→ 200 { items: [{ address, name, blocks_produced, uptime, rank }] }
```

**Acceptance**
- [ ] Sorted correctly.

**Verification**
- Curl.

---

### TASK-158 — Network stats dashboard endpoint

**Section:** api
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
One endpoint that bundles peers/mempool/tps/finality-lag for the HUD.

**Files**
- new: `GET /api/network/dashboard`.

**API contract**
```
→ 200 {
  peers: { active: 5, total: 7 },
  mempool: { pending: 12 },
  tps: { window60: 3.4 },
  finality: { headHeight: 1234, finalizedHeight: 1222, lagBlocks: 12 }
}
```

**Acceptance**
- [ ] All fields populated.

**Verification**
- Curl.

---

### TASK-159 — Block detail with full receipts inline

**Section:** api
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
Existing `/api/blocks/:height` returns block JSON without receipts. Inline them.

**Files**
- edit: `backend/src/api/server.ts:183`.

**Reuses**
- `loadBlockReceipts(height)`.

**API contract**
```
GET /api/blocks/:height?include=receipts
→ 200 { ...block, receipts: [...] }
```

**Acceptance**
- [ ] `?include=receipts` returns receipts array.

**Verification**
- Curl.

---

### TASK-160 — Tx detail with decoded log events

**Section:** api
**Effort:** M
**Depends on:** TASK-097
**Type:** edit

**Goal**
Existing `/api/tx/:hash` returns raw logs. Add ABI-decoded form when contract has registered ABI.

**Files**
- edit: server.ts — extend tx handler.

**Reuses**
- `lookupEvent` from TASK-097.

**API contract**
```
GET /api/tx/:hash?decodeLogs=true
→ 200 { ...tx, logs: [{ ...raw, decoded: { name, fields } | null }] }
```

**Acceptance**
- [ ] Logs from contracts with ABI get decoded form.

**Verification**
- Curl.

---

### TASK-161 — /api/contract/:addr/events feed

**Section:** api
**Effort:** S
**Depends on:** TASK-310, TASK-097
**Type:** new-file

**Goal**
Per-contract event history.

**Files**
- new: `GET /api/contract/:addr/events?limit=&cursor=`.

**Acceptance**
- [ ] Returns logs filtered to that contract address.

**Verification**
- Curl.

---

### TASK-162 — Address tag system

**Section:** api
**Effort:** M
**Depends on:** none
**Type:** new-file

**Goal**
Operators can tag addresses ("exchange", "validator", "burn"). Tags surface alongside balances in account endpoints.

**Files**
- new: `backend/src/database/migrations/0021_address_tags.sql` — `address_tags(address, tag, source, created_at, PK(address, tag))`.
- new: `backend/src/api/tags.ts` — CRUD endpoints.

**API contract**
```
GET /api/tags/:addr → 200 { address, tags: ['exchange', 'validator'] }
POST /api/tags (admin) body: {address, tag} → 200 { ok: true }
DELETE /api/tags/:addr/:tag (admin) → 200 { ok: true }
```

**Acceptance**
- [ ] Tags persist + appear in `/api/account/:addr`.

**Verification**
- Add + read.

---

### TASK-163 — Tag suggestion endpoint

**Section:** api
**Effort:** S
**Depends on:** TASK-162
**Type:** new-file

**Goal**
Heuristic-based suggestions for untagged addresses (high tx count, large balance, validator).

**Files**
- new: `GET /api/tags/suggest/:addr`.

**Implementation sketch**
- If validator → suggest 'validator'.
- If receives many small tx daily → suggest 'exchange'.
- If sends many txs but receives ~0 → suggest 'distributor'.

**Acceptance**
- [ ] Returns list of suggestions with confidence.

**Verification**
- Curl on a known active address.

---

### TASK-164 — Top gas spenders last 24h

**Section:** api
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
Leaderboard of who's burning the most gas.

**Files**
- new: `GET /api/accounts/top-gas?windowHours=24`.

**Acceptance**
- [ ] Returns sorted list.

**Verification**
- Curl.

---

### TASK-165 — /api/reorg/:id detail page

**Section:** api
**Effort:** S
**Depends on:** TASK-060
**Type:** new-file

**Goal**
Drill into a specific reorg event from `reorg_log`.

**Files**
- new: `GET /api/reorg/:id`.

**Acceptance**
- [ ] Returns row + linked orphaned blocks.

**Verification**
- Curl.

---

### TASK-166 — /api/mempool snapshot

**Section:** api
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
List pending txs (capped).

**Files**
- new: `GET /api/mempool?limit=200`.

**Acceptance**
- [ ] Returns array of pending tx JSON.

**Verification**
- Curl.

---

### TASK-167 — /api/mempool/:hash pending tx by hash

**Section:** api
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
Lookup a specific pending tx (404 if mined or unknown).

**Files**
- new: `GET /api/mempool/:hash`.

**Acceptance**
- [ ] 200 with tx if pending; 404 if mined.

**Verification**
- Curl.

---

### TASK-168 — Cancel pending tx endpoint

**Section:** api
**Effort:** M
**Depends on:** TASK-019
**Type:** new-file

**Goal**
Sender-signed cancel: submit a no-op tx with same nonce + 11% higher gas (RBF).

**Files**
- new: `POST /api/mempool/:hash/cancel`.

**Implementation sketch**
- Body: `{ signature }` over message `cancel:${hash}:${timestamp}`.
- Verify signature against tx.from.
- Construct a self-transfer (from→from, value=0) with same nonce + bumped gasPrice.
- Submit via TransactionPool.

**Acceptance**
- [ ] Pending tx cancelled (replaced by no-op).

**Verification**
- Submit, cancel, observe replacement.

---

### TASK-169 — Bulk tx submit endpoint

**Section:** api
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
Single POST with multiple txs.

**Files**
- new: `POST /api/transactions/bulk` body: `{ transactions: [...] }` → `{ accepted: [hashes], rejected: [{tx, reason}] }`.

**Acceptance**
- [ ] Accepts up to 100 per call.

**Verification**
- Bulk curl.

---

### TASK-170 — Idempotent tx submit (dedup on hash)

**Section:** api
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
Re-submitting the same hash should return the existing acceptance, not error.

**Files**
- edit: `backend/src/api/server.ts:319` — check for existing pending or confirmed tx with same hash, short-circuit.

**Acceptance**
- [ ] Same tx submitted twice → 200 both times.

**Verification**
- Submit twice.

---

### TASK-171 — WebSocket equivalents of all SSE channels

**Section:** api
**Effort:** L
**Depends on:** TASK-047, TASK-048, TASK-049
**Type:** new-file

**Goal**
Every SSE endpoint also exposed via WebSocket (for clients that prefer ws).

**Files**
- new: `backend/src/api/ws.ts` — uses `ws` package.
- edit: server.ts — attach ws server to httpServer at `/ws`.

**API contract**
```
ws://host/ws/agent
ws://host/ws/logs
ws://host/ws/mempool
ws://host/ws/forks
```

**Acceptance**
- [ ] Each ws path delivers same events as the SSE counterpart.

**Verification**
- `wscat -c ws://...`.

---

### TASK-172 — Socket.io rooms per address

**Section:** api
**Effort:** M
**Depends on:** none
**Type:** edit

**Goal**
Allow clients to subscribe to `/socket.io` and join a room per address; receive only events touching that address.

**Files**
- edit: server.ts socket.io setup.

**Implementation sketch**
- On `connection`: `socket.on('subscribe', addr => socket.join(`addr:${addr}`))`.
- When a tx is mined or balance changes for addr, emit to `addr:${addr}` room.

**Acceptance**
- [ ] Subscriber gets events only for their address.

**Verification**
- Two browsers, one subscribed; receive only own.

---

### TASK-173 — SSE event replay since cursor

**Section:** api
**Effort:** M
**Depends on:** none
**Type:** edit

**Goal**
SSE clients that reconnect with `Last-Event-ID` should receive missed events.

**Files**
- edit: SSE handlers.

**Implementation sketch**
- Buffer last 1000 events per channel.
- On reconnect, replay events with id > Last-Event-ID, then resume live.

**Acceptance**
- [ ] Reconnect after disconnect → no missed events (within buffer).

**Verification**
- Drop SSE, produce events, reconnect, observe.

---

### TASK-174 — GraphQL gateway over REST

**Section:** api
**Effort:** L
**Depends on:** none
**Type:** new-file

**Goal**
Single GraphQL endpoint at `/graphql` exposing typed queries over the existing REST surface.

**Files**
- new: `backend/src/api/graphql/{schema,resolvers,server}.ts`.
- add deps: `graphql`, `graphql-yoga`.

**Implementation sketch**
- Schema covers: block, tx, account, validator, mempool, logs.
- Resolvers call existing REST handlers internally.

**Acceptance**
- [ ] Sample query returns expected shape.

**Verification**
- GraphiQL.

---

### TASK-175 — tRPC endpoint mirror

**Section:** api
**Effort:** M
**Depends on:** none
**Type:** new-file

**Goal**
tRPC router mirroring REST so TS clients get end-to-end types.

**Files**
- new: `backend/src/api/trpc/router.ts`.
- add dep: `@trpc/server`.

**Implementation sketch**
- Define procedures matching key REST handlers.
- Mount at `/trpc`.

**Acceptance**
- [ ] TypeScript client gets typed responses.

**Verification**
- Sample client script.

---

### TASK-176 — JSON-RPC eth_blockNumber + eth_getBalance

**Section:** api
**Effort:** M
**Depends on:** none
**Type:** new-file

**Goal**
Minimal Ethereum JSON-RPC compat layer so MetaMask + other tools can connect.

**Files**
- new: `backend/src/api/jsonrpc.ts` — POST `/rpc` handler dispatching by `method` field.

**Implementation sketch**
- `eth_blockNumber` → hex of `chain.getChainLength()`.
- `eth_getBalance` → hex of `stateManager.getBalance(addr)`.
- Other methods → `{ error: { code: -32601, message: 'method not found' } }`.

**Acceptance**
- [ ] MetaMask can connect and read balance.

**Verification**
- Configure MetaMask custom RPC.

---

### TASK-177 — JSON-RPC eth_call via VM

**Section:** api
**Effort:** M
**Depends on:** TASK-176, TASK-055
**Type:** edit

**Goal**
Implement `eth_call` for read-only contract execution.

**Files**
- edit: jsonrpc.ts.

**Implementation sketch**
- Dispatch eth_call → run interpreter against current state with read-only flag.
- Return hex of returndata.

**Acceptance**
- [ ] eth_call against deployed contract returns expected result.

**Verification**
- Sample contract call.

---

### TASK-178 — JSON-RPC eth_sendRawTransaction

**Section:** api
**Effort:** M
**Depends on:** TASK-176
**Type:** edit

**Goal**
Accept a signed raw tx and submit to mempool.

**Files**
- edit: jsonrpc.ts.

**Implementation sketch**
- Decode raw tx (RLP if EVM-compat, else our format).
- Insert via `txPool.addTransaction`.
- Return tx hash hex.

**Acceptance**
- [ ] MetaMask can send tx.

**Verification**
- MetaMask sample tx.

---

### TASK-179 — JSON-RPC subscriptions

**Section:** api
**Effort:** L
**Depends on:** TASK-176
**Type:** edit

**Goal**
`eth_subscribe` and `eth_unsubscribe` over WebSocket for newHeads, logs, newPendingTransactions.

**Files**
- edit: jsonrpc.ts + ws.ts.

**Acceptance**
- [ ] Subscribe to newHeads → receives block on each produced.

**Verification**
- wscat with eth_subscribe.

---

### TASK-180 — Postman/Bruno collection generator

**Section:** api
**Effort:** S
**Depends on:** TASK-141
**Type:** script

**Goal**
Generate a Postman / Bruno collection from openapi.json so non-dev users can poke the API.

**Files**
- new: `backend/scripts/gen-postman.ts`.

**Implementation sketch**
- Read openapi.json, walk paths, emit Postman v2.1 collection format.

**Acceptance**
- [ ] Generated collection imports cleanly into Postman.

**Verification**
- Import.

---

## Summary

40 tasks: 23 small, 13 medium, 4 large. Heavy-cluster on JSON-RPC compat (176-179) and observability middleware (146-152).
