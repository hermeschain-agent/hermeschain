# Section 08 — Database & Ops Specs (TASK-306..335)

30 tasks. Migrations, query observability, replica/cache infrastructure, backup/restore, job-queue hardening. Authored first because later sections cite these migration filenames and helper functions by name.

**Preconditions used throughout this section:**
- Migration runner contract at [backend/src/database/migrations.ts:25-60](backend/src/database/migrations.ts#L25-L60). Files named `NNNN_slug.sql`, split on literal `-- down:` line, `-- up:` half is what runs in production.
- Existing migrations: [backend/src/database/migrations/0001_receipts.sql](backend/src/database/migrations/0001_receipts.sql).
- Schema source: [backend/src/database/schema.ts](backend/src/database/schema.ts) — every CREATE TABLE has `IF NOT EXISTS`. New tables go in NEW migration files, not edits to schema.ts.
- DB wrapper: [backend/src/database/db.ts:81-94](backend/src/database/db.ts#L81-L94) exposes `db.query(sql, params) → {rows, rowCount}` and `db.exec(sql)` for multi-statement.
- Redis wrapper: [backend/src/database/db.ts:123-222](backend/src/database/db.ts#L123-L222) exposes `cache.get/set/getJSON/setJSON/incr/hget/hset/hgetall`.

---

### TASK-306 — Migration 0002: index transactions(block_height)

**Section:** db
**Effort:** S
**Depends on:** none
**Type:** migration

**Goal**
The `transactions` table from [schema.ts:24-56](backend/src/database/schema.ts#L24-L56) has no index on `block_height`. Block-detail endpoints currently scan the full table to load a block's txs. Add a btree index so block lookups stay O(log n) as the chain grows.

**Files**
- new: `backend/src/database/migrations/0002_tx_block_height_idx.sql`

**Reuses**
- Pattern from [backend/src/database/migrations/0001_receipts.sql:17-19](backend/src/database/migrations/0001_receipts.sql#L17-L19) — `CREATE INDEX IF NOT EXISTS ... ON ... (...);`

**Migration SQL**
```sql
-- up:
CREATE INDEX IF NOT EXISTS idx_transactions_block_height
  ON transactions(block_height);

-- down:
DROP INDEX IF EXISTS idx_transactions_block_height;
```

**Implementation sketch**
- Drop file in `backend/src/database/migrations/` with the exact name above.
- Verify lexical sort places it after 0001.
- No code changes; runner picks it up on next boot via `applyPendingMigrations()`.

**Acceptance**
- [ ] `backend/src/database/migrations/0002_tx_block_height_idx.sql` exists with both `-- up:` and `-- down:` blocks.
- [ ] Boot logs `[MIGRATIONS] 0002_tx_block_height_idx applied in <N>ms`.
- [ ] `SELECT * FROM pg_indexes WHERE indexname='idx_transactions_block_height'` returns one row.

**Verification**
- Cold boot against an empty PG: `npm run dev` (backend), inspect logs for migration line.
- Hot boot (migration already applied): boot still succeeds, logs `All N migration(s) already applied`.
- `EXPLAIN ANALYZE SELECT * FROM transactions WHERE block_height = 100;` shows `Index Scan` not `Seq Scan`.

---

### TASK-307 — Migration 0003: compound index transactions(from_address, nonce)

**Section:** db
**Effort:** S
**Depends on:** none
**Type:** migration

**Goal**
Mempool admission and `/api/account/:addr/next-nonce` (TASK-057) both compute "max nonce seen from this sender." Without a compound index, that's a full table scan per call. Add `(from_address, nonce DESC)` to make it an index-only lookup.

**Files**
- new: `backend/src/database/migrations/0003_tx_from_nonce_idx.sql`

**Reuses**
- Same `CREATE INDEX IF NOT EXISTS` pattern from 0001.

**Migration SQL**
```sql
-- up:
CREATE INDEX IF NOT EXISTS idx_transactions_from_nonce
  ON transactions(from_address, nonce DESC);

-- down:
DROP INDEX IF EXISTS idx_transactions_from_nonce;
```

**Implementation sketch**
- Drop the SQL file.
- No code changes.

**Acceptance**
- [ ] Index visible via `\d transactions` (psql) under `Indexes:`.
- [ ] `EXPLAIN SELECT MAX(nonce) FROM transactions WHERE from_address = '0xabc'` shows `Index Scan using idx_transactions_from_nonce`.

**Verification**
- Cold boot, scan logs for migration line.

---

### TASK-308 — Migration 0004: index accounts(balance DESC) for top-balances

**Section:** db
**Effort:** S
**Depends on:** none
**Type:** migration

**Goal**
The "Top accounts by balance" endpoint (TASK-155) ranks every account by balance. Without an index, that's a full sort over the accounts table on every call. Add a descending btree so the top-N is an index-range scan.

**Files**
- new: `backend/src/database/migrations/0004_accounts_balance_idx.sql`

**Reuses**
- `CREATE INDEX` pattern from 0001.

**Migration SQL**
```sql
-- up:
CREATE INDEX IF NOT EXISTS idx_accounts_balance_desc
  ON accounts(balance DESC);

-- down:
DROP INDEX IF EXISTS idx_accounts_balance_desc;
```

**Implementation sketch**
- The `accounts` table from [schema.ts:58-66](backend/src/database/schema.ts#L58-L66) stores balance as TEXT (decimal-as-string). PostgreSQL btree sorts TEXT lexicographically — incorrect for numeric ordering. Two options:
  1. **Recommended:** add an additional column `balance_numeric NUMERIC` populated by trigger or ALTER, index that.
  2. Cast index: `CREATE INDEX ... ON accounts ((balance::numeric) DESC)` — works on PG.
- Pick option 2 (zero schema change). Document the cast in spec.

**Migration SQL (revised, option 2)**
```sql
-- up:
CREATE INDEX IF NOT EXISTS idx_accounts_balance_desc
  ON accounts ((balance::numeric) DESC);

-- down:
DROP INDEX IF EXISTS idx_accounts_balance_desc;
```

**Acceptance**
- [ ] Index exists.
- [ ] `EXPLAIN SELECT address, balance FROM accounts ORDER BY balance::numeric DESC LIMIT 100;` uses the index.

**Verification**
- After a few thousand tx, top-100 query returns in <50ms.

---

### TASK-309 — Migration 0005: index receipts(status) for failure-rate queries

**Section:** db
**Effort:** S
**Depends on:** TASK-306 implicitly (migrations are sequential)
**Type:** migration

**Goal**
The `receipts` table from 0001 has indexes on block_number / from / to but not on `status`. "Failure rate over last N blocks" and "latest reverts" queries scan the full table. Add an index.

**Files**
- new: `backend/src/database/migrations/0005_receipts_status_idx.sql`

**Migration SQL**
```sql
-- up:
CREATE INDEX IF NOT EXISTS idx_receipts_status
  ON receipts(status, block_number DESC);

-- down:
DROP INDEX IF EXISTS idx_receipts_status;
```

**Implementation sketch**
- Compound `(status, block_number DESC)` so "latest 100 failed" = single range scan.
- No code changes.

**Acceptance**
- [ ] Index applied.
- [ ] `EXPLAIN SELECT * FROM receipts WHERE status != 1 ORDER BY block_number DESC LIMIT 100;` uses it.

**Verification**
- Inspect `pg_indexes` after boot.

---

### TASK-310 — Migration 0006: GIN index on receipts.logs_json

**Section:** db
**Effort:** S
**Depends on:** none
**Type:** migration

**Goal**
The `/api/logs` endpoint (TASK-024) filters by topic / address inside the `logs_json` text column. Without a GIN index over the parsed JSON, every log query is a full receipts scan. Convert query path to JSONB and add a GIN index for membership queries.

**Files**
- new: `backend/src/database/migrations/0006_receipts_logs_gin.sql`

**Migration SQL**
```sql
-- up:
ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS logs_jsonb JSONB
    GENERATED ALWAYS AS (logs_json::jsonb) STORED;
CREATE INDEX IF NOT EXISTS idx_receipts_logs_gin
  ON receipts USING GIN (logs_jsonb);

-- down:
DROP INDEX IF EXISTS idx_receipts_logs_gin;
ALTER TABLE receipts DROP COLUMN IF EXISTS logs_jsonb;
```

**Implementation sketch**
- Use a generated column so existing writes through `storeReceipt()` in [TransactionReceipt.ts:205-245](backend/src/blockchain/TransactionReceipt.ts#L205-L245) keep going to `logs_json` (text) and PG materializes `logs_jsonb` automatically.
- TASK-024 will query `logs_jsonb @> '[{"address":"0x..."}]'` style.

**Acceptance**
- [ ] Generated column populated for all existing rows.
- [ ] GIN index visible in `\d receipts`.
- [ ] `EXPLAIN SELECT * FROM receipts WHERE logs_jsonb @> '[{"address":"0xabc"}]'` uses index.

**Verification**
- Run migration on a DB with existing receipts, count `WHERE logs_jsonb IS NOT NULL` matches `COUNT(*)`.

---

### TASK-311 — Migration 0007: validators.stake column for weighted quorum

**Section:** db
**Effort:** S
**Depends on:** none
**Type:** migration

**Goal**
TASK-013 (weighted producer selection) and TASK-014 (stake-weighted quorum) need a `stake` column on the `validators` table from [schema.ts:68-87](backend/src/database/schema.ts#L68-L87). Add it with a default of 1 so existing rows keep current head-count quorum behavior.

**Files**
- new: `backend/src/database/migrations/0007_validators_stake.sql`

**Migration SQL**
```sql
-- up:
ALTER TABLE validators
  ADD COLUMN IF NOT EXISTS stake NUMERIC NOT NULL DEFAULT 1;

-- down:
ALTER TABLE validators DROP COLUMN IF EXISTS stake;
```

**Implementation sketch**
- NUMERIC chosen for arbitrary-precision (matches existing balance/value text-as-numeric pattern).
- DEFAULT 1 means TASK-014's `Math.ceil(2 * sumStake / 3)` reduces to the current `Math.ceil(2n/3)` until stakes are explicitly set.

**Acceptance**
- [ ] Column visible in `\d validators`.
- [ ] All existing rows have `stake = 1`.

**Verification**
- `SELECT address, stake FROM validators` shows the new column.

---

### TASK-312 — Migration 0008: validator_slashes table

**Section:** db
**Effort:** S
**Depends on:** TASK-311 (validators.stake referenced)
**Type:** migration

**Goal**
TASK-011 (slashing record) and TASK-012 (slash on equivocation) need a persistent table of slashing events. One row per offense with the offending validator, height, evidence pointer, and stake decrement applied.

**Files**
- new: `backend/src/database/migrations/0008_validator_slashes.sql`

**Migration SQL**
```sql
-- up:
CREATE TABLE IF NOT EXISTS validator_slashes (
  id BIGSERIAL PRIMARY KEY,
  validator_address TEXT NOT NULL,
  block_height BIGINT NOT NULL,
  reason TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  stake_before NUMERIC NOT NULL,
  stake_after NUMERIC NOT NULL,
  slashed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_slashes_validator
  ON validator_slashes(validator_address);
CREATE INDEX IF NOT EXISTS idx_slashes_height
  ON validator_slashes(block_height);

-- down:
DROP INDEX IF EXISTS idx_slashes_height;
DROP INDEX IF EXISTS idx_slashes_validator;
DROP TABLE IF EXISTS validator_slashes;
```

**Implementation sketch**
- TASK-011 will expose `GET /api/validator/:addr/slashes` reading from this table.
- TASK-012 will INSERT into this table when equivocation is detected, then `UPDATE validators SET stake = stake - <slashed_amount>`.

**Acceptance**
- [ ] Table + 2 indexes present.
- [ ] FK pattern (informal — no hard FK to validators.address since that's not unique-indexed in the original schema; document the soft join).

**Verification**
- `INSERT INTO validator_slashes (validator_address, block_height, reason, stake_before, stake_after) VALUES ('0xabc', 100, 'equivocation', 100, 90);` succeeds.

---

### TASK-313 — Migration 0009: contract_code table

**Section:** db
**Effort:** S
**Depends on:** none
**Type:** migration

**Goal**
TASK-079 (CREATE opcode), TASK-081 (contract code storage), and TASK-082 (code-loaded execution) need persistent contract bytecode keyed by contract address. The `accounts` table has a `code` TEXT column already but it's never populated — moving code to its own table avoids bloating account rows and lets us add code-specific metadata later.

**Files**
- new: `backend/src/database/migrations/0009_contract_code.sql`

**Migration SQL**
```sql
-- up:
CREATE TABLE IF NOT EXISTS contract_code (
  address TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  bytecode TEXT NOT NULL,
  deployed_at_block BIGINT NOT NULL,
  deployed_by TEXT NOT NULL,
  deployed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_contract_code_hash
  ON contract_code(code_hash);
CREATE INDEX IF NOT EXISTS idx_contract_code_deployer
  ON contract_code(deployed_by);

-- down:
DROP INDEX IF EXISTS idx_contract_code_deployer;
DROP INDEX IF EXISTS idx_contract_code_hash;
DROP TABLE IF EXISTS contract_code;
```

**Implementation sketch**
- `bytecode` stored as JSON-op string (matches the `vm:` prefix format from [Interpreter.ts](backend/src/vm/Interpreter.ts)) — TEXT not BYTEA.
- `code_hash` enables dedup detection for identical contracts.
- TASK-082 will look up code via `SELECT bytecode FROM contract_code WHERE address = $1` before treating a tx as a plain transfer.

**Acceptance**
- [ ] Table + 2 indexes present.
- [ ] Migration runs after 0008 (sequential).

**Verification**
- `\d contract_code` shows expected schema.

---

### TASK-314 — Migration 0010: contract_storage table

**Section:** db
**Effort:** S
**Depends on:** TASK-313
**Type:** migration

**Goal**
TASK-068 (SLOAD) and TASK-069 (storage persistence) need durable per-contract key/value storage. The Interpreter currently keeps storage in-memory inside the execution result and discards it. Persist it.

**Files**
- new: `backend/src/database/migrations/0010_contract_storage.sql`

**Migration SQL**
```sql
-- up:
CREATE TABLE IF NOT EXISTS contract_storage (
  contract_address TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  storage_value TEXT NOT NULL,
  updated_at_block BIGINT NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (contract_address, storage_key)
);
CREATE INDEX IF NOT EXISTS idx_contract_storage_block
  ON contract_storage(updated_at_block);

-- down:
DROP INDEX IF EXISTS idx_contract_storage_block;
DROP TABLE IF EXISTS contract_storage;
```

**Implementation sketch**
- Composite PK lets SLOAD do `WHERE contract_address = $1 AND storage_key = $2` as an index-only lookup.
- `updated_at_block` index supports state-snapshot logic from TASK-035.
- TASK-069 will `INSERT ... ON CONFLICT (contract_address, storage_key) DO UPDATE SET storage_value = EXCLUDED.storage_value`.

**Acceptance**
- [ ] Table with composite PK present.
- [ ] Block-index in place.

**Verification**
- Insert two rows with same address+key but different values, second is upsert not duplicate-key error.

---

### TASK-315 — Migration 0011: contract_metadata table

**Section:** db
**Effort:** S
**Depends on:** TASK-313
**Type:** migration

**Goal**
TASK-097 (event ABI registry), TASK-098 (source verifier), TASK-101 (contract metadata) need per-contract metadata: human-readable name, JSON ABI, source URL, verifier status. Separate from `contract_code` so verification can be done lazily without touching the bytecode row.

**Files**
- new: `backend/src/database/migrations/0011_contract_metadata.sql`

**Migration SQL**
```sql
-- up:
CREATE TABLE IF NOT EXISTS contract_metadata (
  address TEXT PRIMARY KEY,
  name TEXT,
  abi_json TEXT,
  source_url TEXT,
  source_verified BOOLEAN NOT NULL DEFAULT FALSE,
  verifier_notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_contract_metadata_verified
  ON contract_metadata(source_verified) WHERE source_verified = TRUE;

-- down:
DROP INDEX IF EXISTS idx_contract_metadata_verified;
DROP TABLE IF EXISTS contract_metadata;
```

**Implementation sketch**
- Partial index on `source_verified = TRUE` keeps "list verified contracts" query cheap.
- ABI stored as JSON text; clients parse.
- Soft-link to `contract_code.address` (no hard FK so metadata can be created speculatively).

**Acceptance**
- [ ] Table + partial index present.

**Verification**
- `INSERT INTO contract_metadata (address, name) VALUES ('0xabc', 'MyContract')` works.

---

### TASK-316 — Migration 0012: state_snapshots table

**Section:** db
**Effort:** S
**Depends on:** none
**Type:** migration

**Goal**
TASK-035 (state snapshot every 10k blocks) and TASK-036 (`/api/mesh/snapshot/:height` fast-sync) need a place to store periodic state checkpoints — full state-root + serialized state diff blob, keyed by height.

**Files**
- new: `backend/src/database/migrations/0012_state_snapshots.sql`

**Migration SQL**
```sql
-- up:
CREATE TABLE IF NOT EXISTS state_snapshots (
  height BIGINT PRIMARY KEY,
  state_root TEXT NOT NULL,
  account_count INTEGER NOT NULL,
  storage_count INTEGER NOT NULL,
  snapshot_blob BYTEA NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- down:
DROP TABLE IF EXISTS state_snapshots;
```

**Implementation sketch**
- BYTEA blob holds gzipped JSON of (accounts + contract_storage) at that height.
- TASK-035 will run as a cron during BlockProducer post-commit when `height % 10000 === 0`.
- TASK-036 will stream the blob over HTTP for peer fast-sync.

**Acceptance**
- [ ] Table present, height as PK.

**Verification**
- `INSERT` a 1MB blob, `SELECT octet_length(snapshot_blob) FROM state_snapshots` returns expected size.

---

### TASK-317 — Migration 0013: peers table mirror of peers.json

**Section:** db
**Effort:** S
**Depends on:** none
**Type:** migration

**Goal**
The current peer registry persists to `data/peers.json` (file-backed) per [PeerRegistry.ts:60-79](backend/src/network/PeerRegistry.ts#L60-L79). For multi-replica deploys, the JSON file is local-only. Mirror to a `peers` table so all replicas see the same peer set. Keep the JSON as a write-through cache for fast cold-boot.

**Files**
- new: `backend/src/database/migrations/0013_peers.sql`

**Migration SQL**
```sql
-- up:
CREATE TABLE IF NOT EXISTS peers (
  peer_id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  chain_height BIGINT NOT NULL DEFAULT 0,
  public_key TEXT NOT NULL DEFAULT '',
  last_seen_ms BIGINT NOT NULL,
  first_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_peers_last_seen
  ON peers(last_seen_ms DESC);

-- down:
DROP INDEX IF EXISTS idx_peers_last_seen;
DROP TABLE IF EXISTS peers;
```

**Implementation sketch**
- After this migration, [PeerRegistry.registerPeer()](backend/src/network/PeerRegistry.ts) gets a follow-up commit (separate task in section 04) to UPSERT to PG too.
- Eviction loop will `DELETE FROM peers WHERE last_seen_ms < NOW() - 180000`.

**Acceptance**
- [ ] Table + index present.

**Verification**
- After commit lands, manual `INSERT` works.

---

### TASK-318 — Migration 0014: rename chat_logs → agent_chat_logs

**Section:** db
**Effort:** S
**Depends on:** none
**Type:** migration

**Goal**
The `chat_logs` table from [schema.ts:115-128](backend/src/database/schema.ts#L115-L128) is misnamed — it stores agent conversations, not generic chat. Rename for consistency with `agent_memory`, `agent_completed_tasks`, etc. Use a view to keep old reads working during the rollout window.

**Files**
- new: `backend/src/database/migrations/0014_rename_chat_logs.sql`

**Migration SQL**
```sql
-- up:
ALTER TABLE chat_logs RENAME TO agent_chat_logs;
CREATE OR REPLACE VIEW chat_logs AS SELECT * FROM agent_chat_logs;

-- down:
DROP VIEW IF EXISTS chat_logs;
ALTER TABLE agent_chat_logs RENAME TO chat_logs;
```

**Implementation sketch**
- View preserves backwards-compat for any forgotten callsite. Dropping the view is a separate later task.
- Indexes from the original (chat_logs_validator_address, chat_logs_created_at) get auto-renamed by ALTER TABLE … RENAME.

**Acceptance**
- [ ] `\d agent_chat_logs` shows the table.
- [ ] `\d chat_logs` shows it as a VIEW.
- [ ] `SELECT * FROM chat_logs LIMIT 1` and `SELECT * FROM agent_chat_logs LIMIT 1` both work.

**Verification**
- Boot succeeds (no callsites broken).
- Audit query `grep -rn "chat_logs" backend/src` returns hits for view-friendly read paths only.

---

### TASK-319 — DB connection-pool tuning + monitoring

**Section:** db
**Effort:** M
**Depends on:** none
**Type:** edit

**Goal**
The PG pool from [db.ts:15-21](backend/src/database/db.ts#L15-L21) hardcodes `max: 20`. For Railway production with multiple replicas + worker, that's both under- and over-provisioned for different loads. Make pool size configurable via env, expose pool metrics (`waiting`, `idle`, `total`) for `/api/metrics`.

**Files**
- edit: `backend/src/database/db.ts:15-21` — read `PG_POOL_MAX` (default 20), `PG_POOL_IDLE_MS` (default 30000), `PG_POOL_CONNECT_MS` (default 2000) from env.
- edit: same file — add `db.poolStats(): { total: number, idle: number, waiting: number }` reading from `pool.totalCount`, `pool.idleCount`, `pool.waitingCount`.

**Reuses**
- node-postgres `Pool` instance fields (totalCount/idleCount/waitingCount).

**API contract**
```ts
db.poolStats() → { total: 12, idle: 8, waiting: 0 }
```

**Implementation sketch**
- Add 3 env reads at module top.
- Add public method `poolStats` that returns 0/0/0 when no pool (in-memory mode).
- TASK-152 (`/api/metrics`) will export these as Prometheus gauges `hermes_pg_pool_{total,idle,waiting}`.

**Acceptance**
- [ ] Env override works (`PG_POOL_MAX=50 npm run dev` boots with max=50).
- [ ] `db.poolStats()` returns sensible numbers under load.
- [ ] No breaking change for callers.

**Verification**
- Hit a load test (TASK-400), watch `db.poolStats().waiting` rise then fall.

---

### TASK-320 — DB query-time histogram metric

**Section:** db
**Effort:** M
**Depends on:** TASK-319
**Type:** edit

**Goal**
We have no visibility into PG query latency. Wrap `db.query()` and `db.exec()` to record per-call duration into a histogram exposed at `/api/metrics`. Bucket boundaries: 1ms, 5ms, 10ms, 50ms, 100ms, 500ms, 1s, 5s.

**Files**
- new: `backend/src/database/queryMetrics.ts` — exports `recordQuery(durationMs: number)`, `getHistogram(): { buckets: number[], counts: number[], sum: number, count: number }`.
- edit: `backend/src/database/db.ts:81-94` — wrap `query()` and `exec()` to call `recordQuery(Date.now() - start)`.

**Reuses**
- Prometheus histogram convention (cumulative buckets).

**API contract**
```ts
recordQuery(12)   // ms
getHistogram()
→ { buckets: [1,5,10,50,100,500,1000,5000], counts: [0,0,12,40,8,1,0,0], sum: 23456, count: 61 }
```

**Implementation sketch**
- Use a flat array of bucket counts; increment the smallest bucket where `durationMs <= boundary`.
- Cumulative form computed at read time for Prometheus output (TASK-152).
- Sum + count accumulators for mean derivation.

**Acceptance**
- [ ] Every successful PG query lands in the histogram.
- [ ] Failed queries also recorded (under separate counter `pg_query_errors_total`).

**Verification**
- After 100 queries, `getHistogram().count === 100`.
- Slow query intentionally injected (`SELECT pg_sleep(2)`) lands in 1s+ bucket.

---

### TASK-321 — DB slow-query log

**Section:** db
**Effort:** S
**Depends on:** TASK-320
**Type:** edit

**Goal**
Queries above a threshold (default 1s) should be logged with the SQL + parameter shape (not values, to avoid leaking PII) for diagnosis. Use the wrapper from TASK-320.

**Files**
- edit: `backend/src/database/db.ts` — extend the wrapper to `console.warn('[PG SLOW]', { sql, paramCount, durationMs })` when over threshold.

**Reuses**
- Wrapper added in TASK-320.

**Implementation sketch**
- Threshold via env `PG_SLOW_QUERY_MS` (default 1000).
- SQL truncated to 200 chars in log.
- Param values NEVER logged — only `params.length`.

**Acceptance**
- [ ] Slow query logs include `[PG SLOW]` prefix.
- [ ] Param values absent from log line.

**Verification**
- Inject `SELECT pg_sleep(2)`, observe log.

---

### TASK-322 — Read-replica routing for heavy reads

**Section:** db
**Effort:** L
**Depends on:** TASK-319
**Type:** edit

**Goal**
Single PG instance handles all reads + writes. As traffic grows, heavy reads (block listings, account history) should hit a read replica when one is available, so writes aren't latency-impacted. Add an optional `READ_DATABASE_URL` env; if set, route SELECT-only queries through a second pool.

**Files**
- edit: `backend/src/database/db.ts` — add `readPool` second Pool when env present.
- edit: same — add `db.queryRead(sql, params)` method that prefers `readPool`, falls back to primary.

**Reuses**
- Same Pool config conventions from TASK-319.

**API contract**
```ts
db.queryRead('SELECT * FROM blocks WHERE height = $1', [100]) → {rows, rowCount}
```

**Implementation sketch**
- Detect `READ_DATABASE_URL`; if present, instantiate second Pool with same settings.
- `queryRead` tries readPool first, on connection error falls back to primary pool.
- Existing `db.query()` always hits primary (safe default).
- Audit endpoints (TASK-153, TASK-154, TASK-155) will be updated to use `queryRead` in their respective sections.

**Acceptance**
- [ ] Without env, behavior unchanged.
- [ ] With env, `queryRead` hits replica.
- [ ] Replica unreachable → falls back to primary, logs warning.

**Verification**
- Local: spin up two PG containers, point `READ_DATABASE_URL` at the second, observe `pg_stat_activity` on each.

---

### TASK-323 — pg_dump backup script to S3

**Section:** db
**Effort:** M
**Depends on:** none
**Type:** new-file
**Type:** script

**Goal**
We have no automated DB backup. Add a script that runs `pg_dump`, gzips, uploads to S3 with date-stamped key. Designed to be invoked from a cron (Railway, GH Action, or local).

**Files**
- new: `backend/scripts/backup-db.ts` — entry point.
- new: `backend/scripts/README.md` — operator docs (or appended to existing README).

**Reuses**
- Node `child_process.spawn` for `pg_dump`.
- AWS SDK v3 `@aws-sdk/client-s3` (add to deps if not present).

**Env**
- `DATABASE_URL` — source.
- `S3_BACKUP_BUCKET` — target bucket.
- `S3_BACKUP_PREFIX` — key prefix (default `hermes-backups/`).
- `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` — AWS auth.

**Implementation sketch**
- Spawn `pg_dump --no-owner --no-acl <DATABASE_URL>` → pipe through `gzip` → `PutObjectCommand`.
- Key = `${prefix}${YYYY-MM-DD}/hermes-${HH:MM:SS}.sql.gz`.
- Log size, duration, key on success; non-zero exit on error.
- Optionally enforce retention: list keys older than 30d, delete (behind `--prune` flag).

**Acceptance**
- [ ] `npm run backup` (script alias added in package.json) uploads a fresh dump.
- [ ] Key format matches spec.
- [ ] Script exits 1 on failure.

**Verification**
- Run against a local PG + Localstack S3.

---

### TASK-324 — Restore script + smoke test

**Section:** db
**Effort:** M
**Depends on:** TASK-323
**Type:** script

**Goal**
A backup is only useful if restore works. Add a script that downloads the latest (or a specified) backup, restores into a target DB, and runs a smoke query (`SELECT COUNT(*) FROM blocks`, `SELECT COUNT(*) FROM transactions`).

**Files**
- new: `backend/scripts/restore-db.ts`

**Reuses**
- `@aws-sdk/client-s3` from TASK-323.
- `psql --dbname=$URL -f -` via spawn.

**Env**
- `RESTORE_DATABASE_URL` — target (REFUSED if equals `DATABASE_URL` and `--force` not set, to prevent accidental prod restore).
- Other S3 env from TASK-323.

**Implementation sketch**
- `npm run restore -- --key <s3 key>` — restore that specific backup.
- `npm run restore -- --latest` — restore most recent.
- After restore, run smoke queries; print row counts.
- Refuse to overwrite a non-empty target unless `--force`.

**Acceptance**
- [ ] Round-trip works: backup, drop target, restore, counts match.
- [ ] Smoke output printed.
- [ ] Safety check rejects identical source/target.

**Verification**
- Backup local DB, create empty `hermes_restored`, restore into it, compare row counts.

---

### TASK-325 — CLI: npm run migrate:down NNNN

**Section:** db
**Effort:** S
**Depends on:** none
**Type:** edit + script

**Goal**
The migration runner from [migrations.ts:110-154](backend/src/database/migrations.ts#L110-L154) only runs `up`. The `down:` half is parsed and ignored. Add a CLI for operators to roll back a specific migration locally.

**Files**
- new: `backend/scripts/migrate-down.ts` — parse argv, find matching migration file, run its down half, delete row from `schema_migrations`.
- edit: `backend/package.json:scripts` — add `"migrate:down": "ts-node backend/scripts/migrate-down.ts"`.

**Reuses**
- Migration loader logic from `loadMigrationsFrom()` in [migrations.ts:42-61](backend/src/database/migrations.ts#L42-L61). Export it (currently file-internal).

**Implementation sketch**
- Usage: `npm run migrate:down 0007`.
- Refuses to run in production unless `FORCE_PROD_DOWN=1` env set.
- Wraps the down-block in a transaction so partial failure rolls back.
- Removes corresponding row from `schema_migrations`.

**Acceptance**
- [ ] Running with valid NNNN executes the down block.
- [ ] `schema_migrations` row removed.
- [ ] Re-running `npm run dev` re-applies the up.

**Verification**
- Apply 0007, run down, verify column dropped, verify row gone, restart, verify column added again.

---

### TASK-326 — Migration dry-run mode

**Section:** db
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
`applyPendingMigrations()` always writes. Operators can't preview what would change. Add a dry-run mode that prints the SQL each pending migration would execute, then exits without writing.

**Files**
- edit: `backend/src/database/migrations.ts:110` — add an optional `{ dryRun?: boolean }` arg.
- new: `backend/scripts/migrate-status.ts` — prints applied + pending, with `--dry-run` flag invoking `applyPendingMigrations({ dryRun: true })`.
- edit: `backend/package.json:scripts` — add `"migrate:status": "ts-node backend/scripts/migrate-status.ts"`.

**Reuses**
- Existing `migrationStatus()` from [migrations.ts:156-167](backend/src/database/migrations.ts#L156-L167).

**Implementation sketch**
- In dry-run, replace `db.exec(migration.up)` with `console.log('[DRY-RUN]', migration.name, '\n', migration.up)`.
- Skip the INSERT into schema_migrations.
- Lock still acquired/released so behavior matches real run.

**Acceptance**
- [ ] `npm run migrate:status -- --dry-run` prints SQL without applying.
- [ ] Real boot still applies migrations as normal.

**Verification**
- Add a stub migration, dry-run, observe SQL printed, observe nothing in `schema_migrations`.

---

### TASK-327 — Schema-diff against prod CLI

**Section:** db
**Effort:** M
**Depends on:** none
**Type:** script

**Goal**
Drift between dev schema and prod is invisible. Add a script that connects to two DB URLs (dev + prod), introspects every table + index + column, and prints a diff. Read-only; never writes.

**Files**
- new: `backend/scripts/schema-diff.ts`
- edit: `backend/package.json:scripts` — add `"schema:diff": "ts-node backend/scripts/schema-diff.ts"`.

**Reuses**
- `pg` Client (not Pool — short-lived, two distinct URLs).

**Implementation sketch**
- Args: `npm run schema:diff -- --left $DEV_URL --right $PROD_URL`.
- For each side, query `information_schema.tables`, `.columns`, `pg_indexes`.
- Build a normalized fingerprint per table (sorted columns, sorted indexes).
- Diff fingerprints; print added/removed/changed.
- Exit 1 if differences found (CI-friendly).

**Acceptance**
- [ ] Reports identical schemas as "no diff".
- [ ] Reports an extra column on one side as a single line `+ accounts.foo TEXT`.

**Verification**
- Diff against itself → no output, exit 0.
- Apply a migration on one only → diff shows the change.

---

### TASK-328 — Redis cache warmer at boot

**Section:** db
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
Cold boot leaves Redis empty; the first ~30s of traffic causes burst PG reads as the cache populates. Pre-warm with the things `chainState` (line 225 of db.ts) is going to read anyway: latest 100 blocks, top 50 accounts by balance, last block height.

**Files**
- new: `backend/src/database/cacheWarmer.ts` — exports `warmCache(): Promise<void>`.
- edit: `backend/src/api/server.ts` — invoke after `applyPendingMigrations()` and before route mounting.

**Reuses**
- `cache.setJSON()` from [db.ts:148-170](backend/src/database/db.ts#L148-L170).
- `chainState` getters from [db.ts:225-280](backend/src/database/db.ts#L225-L280).

**Implementation sketch**
- Warmer runs once at boot, behind `CACHE_WARMER_ENABLED=true` env (default off in dev, on in production).
- Reads:
  - Last 100 blocks → `cache.setJSON('block:height:N', ..., 300)`.
  - Top 50 accounts → `cache.setJSON('top_accounts', ..., 60)`.
- All warming work runs in parallel via `Promise.all`.
- Logs total entries warmed + duration.

**Acceptance**
- [ ] Warmer boots cleanly even with empty PG.
- [ ] Logs count + duration.
- [ ] Doesn't block the server from starting (parallel-with-listen).

**Verification**
- Boot with empty cache, confirm `cache.get('block:height:1')` returns the block right after boot completes.

---

### TASK-329 — Redis key TTL audit

**Section:** db
**Effort:** S
**Depends on:** none
**Type:** script

**Goal**
The `cache` wrapper accepts an optional TTL but many callsites pass none, leaking memory long-term. Add a script that scans every `cache.set/setJSON/hset` callsite in `backend/src/` and reports the ones missing a TTL.

**Files**
- new: `backend/scripts/audit-redis-ttl.ts`

**Reuses**
- Plain `fs.readdirSync` recursion + regex matching.

**Implementation sketch**
- Walk `backend/src/`, read every .ts.
- Match `cache.set(`, `cache.setJSON(`, `cache.hset(` invocations.
- Inspect arg list: third arg present = TTL set; absent = leak risk.
- Print one line per leak: `path:line — cache.set('foo', ...)` (no TTL).
- Exit 1 if any leaks found (CI-friendly).

**Acceptance**
- [ ] Script runs, prints exactly one line per missing-TTL callsite.
- [ ] Recognizes inline string keys + variable keys.

**Verification**
- Add a test fixture with one missing-TTL call, run script, see it.

---

### TASK-330 — Redis pub/sub channel for cross-replica events

**Section:** db
**Effort:** M
**Depends on:** none
**Type:** new-file

**Goal**
Today's [EventBus](backend/src/events/EventBus.ts) is in-process. SSE clients on replica A miss events emitted on replica B. Add a Redis pub/sub bridge: emit local → republish to channel; subscribe channel → emit local. Replicas converge on the same event stream.

**Files**
- new: `backend/src/events/RedisBridge.ts` — exports `attachRedisBridge(eventBus: EventBus, redis: Redis): { detach(): void }`.
- edit: `backend/src/api/server.ts` — invoke after eventBus + redis are constructed.

**Reuses**
- ioredis duplicated client pattern (one publisher + one subscriber, since subscriber blocks).
- Existing event names from grep over `eventBus.emit(`.

**Implementation sketch**
- Whitelist of event types that are safe to bridge (block_produced, network_message, ci_results, consensus_quorum) — others stay local.
- Loop-prevention: tag bridged messages with `_origin = REPLICA_ID`; ignore if echoed back.
- Channel name: `hermes:events:v1`.

**Acceptance**
- [ ] Two-replica test: emit on A, observe on B (within 100ms).
- [ ] No infinite loop.
- [ ] Non-whitelisted events stay local.

**Verification**
- Local: run two backend instances pointing at same Redis, watch B's logs when A produces a block.

---

### TASK-331 — Two-replica web service: pin SSE to one replica

**Section:** db
**Effort:** M
**Depends on:** TASK-330
**Type:** edit

**Goal**
With two web replicas behind a load balancer, SSE clients can land on either. Without sticky sessions, a reconnect lands on the other replica with no event history. Either: (a) sticky sessions via cookie, or (b) only one replica accepts SSE. Pick (b) since LB config may not be in our hands.

**Files**
- edit: `backend/src/api/server.ts` — `/api/agent/stream` and other SSE routes return 503 if `process.env.SSE_REPLICA !== 'true'`.

**Reuses**
- Existing SSE route handlers.

**Implementation sketch**
- Env `SSE_REPLICA=true` set on exactly one replica via Railway service config.
- 503 response includes header `X-SSE-Failover: true` so clients can retry against a different host (when we add multiple).
- HUD reconnect logic (TASK-245) handles the 503.

**Acceptance**
- [ ] Default replica returns 503 on `/api/agent/stream`.
- [ ] Replica with env=true serves SSE normally.

**Verification**
- Two-replica Railway deploy: only the one with env serves the HUD ticker.

---

### TASK-332 — Worker leader election

**Section:** db
**Effort:** M
**Depends on:** none
**Type:** new-file

**Goal**
Two worker replicas would both run the AgentWorker loop simultaneously and produce duplicate commits. Add a leader-election lease via Redis SETNX with TTL. Only the leader runs the agent loop; followers no-op.

**Files**
- new: `backend/src/agent/leaderElection.ts` — exports `acquireLeadership(redis: Redis, leaseId: string): Promise<boolean>` and `renewLease(): Promise<boolean>`.
- edit: `backend/src/worker.ts` — wrap the agent loop start with leadership check; renew every 10s; release on shutdown.

**Reuses**
- ioredis `set('key', val, 'PX', ttlMs, 'NX')` semantics.

**Implementation sketch**
- Key: `hermes:worker:leader`.
- Value: this replica's hostname + pid.
- TTL: 30s; renewal every 10s with `EXPIRE` (only if value matches our id, via Lua script for atomicity).
- On lease loss (renew returns false), kill the agent loop, fall back to "follower" state.

**Acceptance**
- [ ] Single worker: gets leader, agent runs.
- [ ] Two workers: only one gets leader; the other logs `[LEADER] follower mode`.
- [ ] Kill the leader: the follower picks up within ~30s.

**Verification**
- Local: run worker.ts twice against same Redis, observe.

---

### TASK-333 — Stuck-job recovery

**Section:** db
**Effort:** M
**Depends on:** TASK-332
**Type:** edit

**Goal**
If the agent worker crashes mid-task, the task stays in "in_progress" forever and never gets retried. Add a recovery sweep that, on worker startup (and once every 5 min), finds tasks in `agent_tasks` with `status='in_progress'` and `started_at < NOW() - 1 hour`, resets them to `status='pending'` and increments a `recovery_count`.

**Files**
- new: `backend/src/database/migrations/0015_agent_tasks_recovery.sql` — `ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS recovery_count INTEGER NOT NULL DEFAULT 0;`
- edit: `backend/src/agent/AgentWorker.ts` — add `recoverStuckTasks()` method, call from constructor + interval.

**Reuses**
- Existing PG access via `db.query`.
- Pattern from existing AgentWorker query callsites.

**Implementation sketch**
- Recovery query: `UPDATE agent_tasks SET status='pending', recovery_count=recovery_count+1 WHERE status='in_progress' AND started_at < NOW() - INTERVAL '1 hour' RETURNING id`.
- Log each recovered task ID.
- After 5 recoveries on the same task, mark it `status='abandoned'` (separate hard-stop to avoid infinite retry loops).

**Acceptance**
- [ ] Stuck tasks return to pending.
- [ ] `recovery_count` increments.
- [ ] After 5 recoveries, task marked abandoned and logged.

**Verification**
- Insert a fake stuck row, run AgentWorker, observe.

---

### TASK-334 — Dead-letter queue for failed agent tasks

**Section:** db
**Effort:** M
**Depends on:** TASK-333
**Type:** edit + migration

**Goal**
Tasks that fail repeatedly get marked `failed` but stay in the same table, cluttering the active queue. Move them to a dead-letter table with the failure reason for triage.

**Files**
- new: `backend/src/database/migrations/0016_dead_letter_tasks.sql`
- edit: `backend/src/agent/AgentWorker.ts` — when `failure_count >= 3`, move row to `dead_letter_tasks` and delete from `agent_tasks`.

**Migration SQL**
```sql
-- up:
CREATE TABLE IF NOT EXISTS dead_letter_tasks (
  id TEXT PRIMARY KEY,
  original_task_json TEXT NOT NULL,
  last_error TEXT,
  failure_count INTEGER NOT NULL,
  moved_to_dlq_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_dlq_moved_at
  ON dead_letter_tasks(moved_to_dlq_at DESC);

-- down:
DROP INDEX IF EXISTS idx_dlq_moved_at;
DROP TABLE IF EXISTS dead_letter_tasks;
```

**Implementation sketch**
- Move = `INSERT INTO dead_letter_tasks (id, original_task_json, last_error, failure_count) SELECT id, row_to_json(t.*)::text, last_error, failure_count FROM agent_tasks t WHERE id = $1; DELETE FROM agent_tasks WHERE id = $1;` in one transaction.

**Acceptance**
- [ ] Task that fails 3x lands in DLQ.
- [ ] Active queue no longer contains it.

**Verification**
- Insert a synthetic always-failing task, run agent, watch it move.

---

### TASK-335 — Job retry dashboard

**Section:** db
**Effort:** M
**Depends on:** TASK-334
**Type:** new-file

**Goal**
Surface DLQ + recovery stats in the HUD. Endpoint that returns counts of pending / in_progress / failed / abandoned / dead-lettered, plus the 20 most recent DLQ entries.

**Files**
- new: `backend/src/api/jobs.ts` — Express router.
- edit: `backend/src/api/server.ts` — mount at `/api/jobs`.

**Reuses**
- Express router pattern from [backend/src/api/wallet.ts](backend/src/api/wallet.ts).

**API contract**
```
GET /api/jobs/stats
→ 200 {
  pending: 10,
  in_progress: 1,
  failed: 2,
  abandoned: 0,
  dead_lettered: 5
}

GET /api/jobs/dlq?limit=20
→ 200 { items: [ { id, last_error, failure_count, moved_to_dlq_at } ] }

POST /api/jobs/dlq/:id/retry
→ 200 { restored: true }
→ 404 { error: 'not in dlq' }
```

**Implementation sketch**
- `/stats` is one query against `agent_tasks` group-by status + one count from `dead_letter_tasks`.
- `/dlq` reads recent rows.
- `/dlq/:id/retry` moves row back to `agent_tasks` with `status='pending'`, `failure_count=0`.
- Retry endpoint is admin-gated via `requireApiKey('jobs:write')` from [auth.ts](backend/src/api/auth.ts).

**Acceptance**
- [ ] `/stats` returns counts matching DB ground truth.
- [ ] `/dlq/:id/retry` moves row, returns 200.
- [ ] Auth on retry rejected without admin scope.

**Verification**
- `curl /api/jobs/stats` against running backend.

---

## Summary

| TASK | Title | Effort |
|---|---|---|
| 306 | Index transactions(block_height) | S |
| 307 | Index transactions(from_address, nonce) | S |
| 308 | Index accounts(balance DESC) | S |
| 309 | Index receipts(status) | S |
| 310 | GIN index on receipts.logs_json | S |
| 311 | validators.stake column | S |
| 312 | validator_slashes table | S |
| 313 | contract_code table | S |
| 314 | contract_storage table | S |
| 315 | contract_metadata table | S |
| 316 | state_snapshots table | S |
| 317 | peers table | S |
| 318 | Rename chat_logs | S |
| 319 | Pool tuning + monitoring | M |
| 320 | Query-time histogram | M |
| 321 | Slow-query log | S |
| 322 | Read-replica routing | L |
| 323 | pg_dump → S3 | M |
| 324 | Restore script + smoke test | M |
| 325 | migrate:down CLI | S |
| 326 | Migration dry-run mode | S |
| 327 | Schema-diff CLI | M |
| 328 | Redis cache warmer | S |
| 329 | Redis TTL audit script | S |
| 330 | Redis pub/sub bridge | M |
| 331 | SSE replica pinning | M |
| 332 | Worker leader election | M |
| 333 | Stuck-job recovery | M |
| 334 | Dead-letter queue | M |
| 335 | Job retry dashboard | M |

13 small, 14 medium, 1 large. Net effort ≈ 30 commits over ~2 days at the 60/day cadence.
