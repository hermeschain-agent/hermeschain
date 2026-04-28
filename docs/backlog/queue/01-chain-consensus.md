# Section 01 — Chain & Consensus Specs (TASK-001..060)

60 tasks. Block deserialization for gossip-apply, peer sync, finality, validator rotation/slashing, mempool hardening, log indexing, fork accounting, fee burning, scripts/CLIs, and a batch of read endpoints (`tps`, `block-times`, account/validator history, reorg log).

**Preconditions used throughout this section:**
- Chain core: [Chain.ts](backend/src/blockchain/Chain.ts) — `addBlock` (line 193) routes non-canonical blocks via `forkManager.addBlock()` (line 205); `handleReorg(newBlocks, commonAncestorHeight)` at line 361 reverts state then re-applies; `getChainLength()` (line 308) returns synthetic wall-clock height.
- BlockProducer: [BlockProducer.ts](backend/src/blockchain/BlockProducer.ts) `produceBlock()` loop at line 70.
- Consensus singletons: `proofOfAI`, `difficultyManager`, `forkManager` from [Consensus.ts](backend/src/blockchain/Consensus.ts). `ForkManager.isFinalized(hash)` at line 239 uses `FORK_CHOICE_DEPTH = 6`.
- TransactionPool: [TransactionPool.ts](backend/src/blockchain/TransactionPool.ts) — `addTransaction` (line 68), `evictInvalid` (line 143), `readmitOrphaned` (line 168), `validateTransaction` (line 184).
- StateManager: [StateManager.ts](backend/src/blockchain/StateManager.ts) — `applyTransaction`, `revertBlock`, `applyBlockReward`, `commitBlock`, `getStateRoot`.
- Receipts: [TransactionReceipt.ts](backend/src/blockchain/TransactionReceipt.ts) — `createReceipt`, `storeReceipt`, `loadReceipt`, `loadBlockReceipts`, `calculateReceiptsRoot`.
- Block class: [Block.ts](backend/src/blockchain/Block.ts) — constructor `(height, parentHash, producer, transactions, difficulty)`, `isValid(prev?)`, `toJSON()`.
- Crypto: [Crypto.ts](backend/src/blockchain/Crypto.ts) — `verifyTransactionSignature(tx)`, `verify(message, sig, pubkey)`, `sha256Base58`.
- Mesh router: [backend/src/network/api.ts](backend/src/network/api.ts) — `/api/mesh/*` routes; `POST /api/mesh/block` currently returns `accepted:false`.
- Event bus: [EventBus.ts](backend/src/events/EventBus.ts) — `eventBus.emit(name, payload)`. Existing events listed in section 08 preamble.
- SSE pattern: [server.ts:971-1057](backend/src/api/server.ts#L971-L1057) — pattern for new SSE endpoints in TASK-047/048/049.

---

### TASK-001 — Block.fromJSON deserializer

**Section:** chain
**Effort:** M
**Depends on:** none
**Type:** edit

**Goal**
[Block.ts](backend/src/blockchain/Block.ts) only has `toJSON()` (line 173). Gossip-apply (TASK-002) and chain import (TASK-029) need the inverse: take the JSON shape produced by `toJSON()` and reconstruct an equivalent Block instance whose `.header.hash` matches the original.

**Files**
- edit: `backend/src/blockchain/Block.ts` — add `static fromJSON(json: any): Block` after the existing `toJSON` method.

**Reuses**
- The Block constructor's hash calculation in [Block.ts:103-115](backend/src/blockchain/Block.ts#L103-L115).
- `setStateRoot()` (line 143) for re-applying the deserialized state root.

**Implementation sketch**
- Validate that `json` has every required header field; throw `Error('fromJSON: missing field <name>')` with explicit field name on miss.
- Reconstruct each transaction by parsing `value`, `gasPrice`, `gasLimit` back from string → bigint.
- Construct `new Block(json.height, json.parentHash, json.producer, txs, json.difficulty)`.
- Override generated `timestamp`, `nonce`, `gasUsed`, `gasLimit` via direct header assignment.
- Call `setStateRoot(json.stateRoot)` so the hash recomputes.
- Override `transactionsRoot` and `receiptsRoot` to the deserialized values, then recompute hash.
- Final assertion: `block.header.hash === json.hash`; throw `Error('fromJSON: hash mismatch — header field tampered')` if not.

**Acceptance**
- [ ] Round-trip property: `Block.fromJSON(b.toJSON()).header.hash === b.header.hash` for any locally-produced block.
- [ ] Tampered field (e.g. mutate `json.height`) → fromJSON throws `hash mismatch`.
- [ ] Empty transactions list works.

**Verification**
- Local script: produce a block, JSON it, fromJSON it, compare every header field.

---

### TASK-002 — Wire /api/mesh/block to call chain.addBlock after fromJSON

**Section:** chain
**Effort:** S
**Depends on:** TASK-001
**Type:** edit

**Goal**
[network/api.ts:55-73](backend/src/network/api.ts#L55-L73) currently returns `accepted: false` because the deserializer was missing. With TASK-001, complete the gossip path: deserialize → addBlock → respond with the accept/reorg outcome.

**Files**
- edit: `backend/src/network/api.ts:55-73` — replace the conservative stub with real acceptance.

**Reuses**
- `Block.fromJSON` from TASK-001.
- `chain.addBlock(block)` from [Chain.ts:193](backend/src/blockchain/Chain.ts#L193).

**API contract**
```
POST /api/mesh/block
body: { ...Block.toJSON output... }
→ 200 { accepted: true, head: { height, hash } }
→ 409 { accepted: false, reason: 'parent unknown' | 'finalized-conflict' | 'invalid' }
→ 400 { accepted: false, reason: 'fromJSON failed: <msg>' }
```

**Implementation sketch**
- Try `Block.fromJSON(req.body)` inside try/catch → 400 on throw.
- Call `chain.addBlock(block)`.
- 200 with new head if accepted; 409 with reason otherwise.
- Continue emitting `mesh_block_received` for observability.

**Acceptance**
- [ ] Valid block from a peer at our parent → accepted.
- [ ] Block with unknown parent → 409 `parent unknown`.
- [ ] Tampered block → 400 with deserializer message.

**Verification**
- Local two-node sim: A produces, B receives via curl.

---

### TASK-003 — Header-only sync endpoint /api/mesh/headers

**Section:** chain
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
Full-block sync is bandwidth-heavy. Peers that only need to verify the chain tip / measure honest-majority can pull headers only. Add a header-range fetch.

**Files**
- edit: `backend/src/network/api.ts` — add `GET /api/mesh/headers`.

**Reuses**
- `chain.getBlockByHeight(h)` from [Chain.ts:296](backend/src/blockchain/Chain.ts#L296).

**API contract**
```
GET /api/mesh/headers?from=100&to=200
→ 200 { headers: [ { height, hash, parentHash, producer, timestamp, stateRoot, transactionsRoot, receiptsRoot, gasUsed, gasLimit, difficulty } ... ] }
→ 400 { error: 'from > to' | 'range exceeds 1000' }
```

**Implementation sketch**
- Hard cap range: `to - from <= 1000`.
- Loop `from..=to`, look up each block, push its header (not transactions).
- Skip-and-continue on missing heights (don't 500).
- Convert `gasUsed`/`gasLimit` bigint → string.

**Acceptance**
- [ ] Range under 1000 returns headers.
- [ ] Range over 1000 returns 400.
- [ ] Out-of-range heights silently skipped, not erroring.

**Verification**
- `curl /api/mesh/headers?from=0&to=5` returns 6 headers (genesis + 5).

---

### TASK-004 — Bulk block fetch /api/mesh/blocks

**Section:** chain
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
TASK-003's headers tell a peer what's missing; this endpoint serves the actual blocks for sync.

**Files**
- edit: `backend/src/network/api.ts` — add `GET /api/mesh/blocks`.

**Reuses**
- `chain.getBlockByHeight()` and `block.toJSON()`.

**API contract**
```
GET /api/mesh/blocks?from=100&to=200
→ 200 { blocks: [ { ...toJSON() } ... ] }
→ 400 { error: 'range exceeds 100' }  // tighter cap than headers
```

**Implementation sketch**
- Cap range: `to - from <= 100` (full blocks are bigger than headers).
- Same skip-on-missing semantics as TASK-003.

**Acceptance**
- [ ] Returns full block objects compatible with TASK-001's `fromJSON`.
- [ ] Range >100 returns 400.

**Verification**
- Round-trip: pull blocks via this endpoint, fromJSON each, hash matches original.

---

### TASK-005 — Peer head poller

**Section:** chain
**Effort:** M
**Depends on:** none
**Type:** new-file

**Goal**
A peer that announces never updates its `chainHeight` again until we ask. We need a 30s poller that hits each peer's `/api/mesh/head` and refreshes their `chainHeight` in our [PeerRegistry](backend/src/network/PeerRegistry.ts).

**Files**
- new: `backend/src/network/headPoller.ts` — exports `startHeadPoller(): {stop()}`.
- edit: `backend/src/api/server.ts` — start poller after mesh router mount.

**Reuses**
- `peerRegistry.listPeers()` and `registerPeer({...input, lastSeenMs: now})`.
- Native `fetch()`.

**Implementation sketch**
- Every 30s: `Promise.allSettled(peers.map(p => fetch(p.url + '/api/mesh/head')))`.
- On 200: update peer's `chainHeight` via `registerPeer()` (which doubles as a heartbeat).
- On error: do NOT decrement lastSeen; eviction loop handles dead peers.
- Skip self (compare against `HERMES_PUBLIC_URL`).

**Acceptance**
- [ ] Two-node setup: heights converge in PeerRegistry within ~60s of one node producing a new block.
- [ ] Dead peer doesn't crash the loop.

**Verification**
- Run two backends locally, watch peerRegistry.listPeers() over time.

---

### TASK-006 — Auto-sync on start: pick highest-height peer, pull missing

**Section:** chain
**Effort:** M
**Depends on:** TASK-001, TASK-002, TASK-004
**Type:** new-file

**Goal**
Cold-boot replica is at height 0 (or wherever DB left off). It should detect peers, find the highest known head, and pull missing blocks until caught up — automatically.

**Files**
- new: `backend/src/network/syncManager.ts` — exports `runInitialSync(chain): Promise<{synced: number, from: string|null}>`.
- edit: `backend/src/api/server.ts` — invoke after `chain.initialize()` and after first peer announce returns (give it 5s for peers to reply).

**Reuses**
- `peerRegistry.listPeers()`, `chain.getChainLength()`, `chain.addBlock()`, `Block.fromJSON()`.

**Implementation sketch**
- Wait 5s after boot for at least one peer announce.
- If no peers, no-op (we may BE the seed).
- Else: pick `peers.sort((a,b) => b.chainHeight - a.chainHeight)[0]`.
- If their height ≤ ours, no-op.
- Loop: pull `[ourHeight+1 .. min(theirHeight, ourHeight+100)]` via `/api/mesh/blocks`, fromJSON each, addBlock.
- If addBlock returns false, log + skip (will be retried next sync tick).
- After full catch-up, log `[SYNC] caught up to height N from peer X`.

**Acceptance**
- [ ] Empty replica + one full peer: replica catches up to peer's height.
- [ ] No peers: silent no-op, doesn't block boot.

**Verification**
- Drop a fresh DB, start backend with bootstrap peer pointing at a populated peer.

---

### TASK-007 — Reorg-on-sync: walk back to common ancestor

**Section:** chain
**Effort:** L
**Depends on:** TASK-006
**Type:** edit

**Goal**
TASK-006 assumes the local chain is a strict prefix of the peer's. If they've diverged, we need to find the common ancestor (via header probes), then reorg from there. Otherwise we'd just see "parent unknown" rejections forever.

**Files**
- edit: `backend/src/network/syncManager.ts` — extend with `findCommonAncestor(peer)` + reorg-walk path.

**Reuses**
- `Chain.findCommonAncestor` exists at [Chain.ts:476](backend/src/blockchain/Chain.ts#L476) but works on in-memory blocks; we need a peer-side variant.
- `chain.handleReorg(newBlocks, commonAncestorHeight)` at [Chain.ts:361](backend/src/blockchain/Chain.ts#L361).

**Implementation sketch**
- `findCommonAncestor(peerUrl)`:
  - Pull peer's headers in chunks of 100, walking back from peer head.
  - For each header, check if `chain.getBlockByHash(header.hash)` exists locally.
  - First match is the ancestor. If walk exhausts without match, ancestor = height 0 (genesis).
- After ancestor found: pull peer's full blocks for `[ancestor+1 .. peerHead]`, then call `chain.handleReorg(newBlocks, ancestor)`.
- Add a max-depth guard (default 1000) — refuse to reorg deeper than that without operator confirmation (env `MAX_REORG_DEPTH`).

**Acceptance**
- [ ] Two nodes diverge at height 50, sync converges them on the longer chain.
- [ ] Reorg deeper than `MAX_REORG_DEPTH` is refused with `[SYNC] refusing reorg of depth N > max M`.

**Verification**
- Local: produce different chains on two nodes, then bring up syncManager.

---

### TASK-008 — Finalized block flag at depth N-12

**Section:** chain
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
[ForkManager.isFinalized()](backend/src/blockchain/Consensus.ts) uses depth-6. Hermeschain wants 12 (matching common L1 conventions). Centralize the constant, expose finality height in chainState, surface in `/api/status`.

**Files**
- edit: `backend/src/blockchain/Consensus.ts` — change `FORK_CHOICE_DEPTH` from 6 → 12 (or via env `FINALITY_DEPTH`).
- edit: `backend/src/database/db.ts:225-280` (chainState) — add `setFinalizedHeight(h)`, `getFinalizedHeight()`.
- edit: `backend/src/blockchain/Chain.ts` — after each successful `addBlock`, write finalized height = `chainLength - 12` to chainState.

**Reuses**
- `chainState` Redis-backed store.

**Implementation sketch**
- After `addBlock` succeeds and updates `chainState.saveBlockHeight()`, additionally call `chainState.setFinalizedHeight(Math.max(0, this.getChainLength() - 12))`.
- Surface in `/api/status` payload.

**Acceptance**
- [ ] After 100 blocks, finalized height = 88.
- [ ] Visible in `/api/status` JSON.

**Verification**
- `curl /api/status | jq .finalizedHeight`.

---

### TASK-009 — Reject reorg attempts past finality depth

**Section:** chain
**Effort:** S
**Depends on:** TASK-008
**Type:** edit

**Goal**
Reorgs deeper than the finality depth violate finality guarantees. Refuse them in `addBlock` and `handleReorg`.

**Files**
- edit: `backend/src/blockchain/Chain.ts:193,361` — pre-check reorg depth against finalized height.

**Reuses**
- `chainState.getFinalizedHeight()` from TASK-008.
- `findCommonAncestor` at [Chain.ts:476](backend/src/blockchain/Chain.ts#L476).

**Implementation sketch**
- In `addBlock` fork-route: before calling `forkManager.addBlock`, compute the would-be reorg depth. If `commonAncestorHeight < finalizedHeight`, log and return false with reason `finality-violation`.
- Same check in `handleReorg`.
- Caller endpoints (TASK-002) translate this to 409 with `reason: 'finalized-conflict'`.

**Acceptance**
- [ ] Reorg at depth ≥ finality depth: refused.
- [ ] Shallow reorg: works as before.

**Verification**
- Force a deep reorg via `/api/mesh/block` with a competing chain at depth 20; expect 409.

---

### TASK-010 — VRF-style proposer rotation hash(prev_hash + height) mod n

**Section:** chain
**Effort:** S
**Depends on:** TASK-013 (need stake column for validator listing)
**Type:** edit

**Goal**
Current rotation in [ValidatorManager.ts](backend/src/validators/ValidatorManager.ts) uses `height % n`. That's predictable; replace with a deterministic hash-based rotation that uses parent hash entropy too: `producer = validators[ hash(prevHash + height) mod n ]`.

**Files**
- edit: `backend/src/validators/ValidatorManager.ts` — `selectProducer` accepts `(nextHeight, parentHash)`; use sha256 → bigint → mod.
- edit: `backend/src/blockchain/BlockProducer.ts:75` — pass parent hash to selectProducer.

**Reuses**
- `sha256Base58` from [Crypto.ts:194](backend/src/blockchain/Crypto.ts#L194).

**Implementation sketch**
- `const seed = sha256(`${parentHash}:${nextHeight}`)`.
- `const idx = Number(BigInt('0x' + seed.slice(0, 16)) % BigInt(validatorOrder.length))`.
- For backwards-compat, when `parentHash` not provided, fall back to `height % n`.

**Acceptance**
- [ ] Same (parentHash, height) → same producer.
- [ ] Different parentHash → distribution flat over many trials.
- [ ] No-arg call works as before.

**Verification**
- Unit test: 1000 selections across (parentHash, height) pairs cover all validators ±10%.

---

### TASK-011 — validator_slashes read endpoint

**Section:** chain
**Effort:** S
**Depends on:** TASK-312 (table exists)
**Type:** edit

**Goal**
Surface the slashing log built by TASK-012. Two endpoints: per-validator history and global recent.

**Files**
- new: handlers in `backend/src/api/server.ts` (or new `backend/src/api/slashing.ts` router).

**Reuses**
- `db.query` against `validator_slashes`.

**API contract**
```
GET /api/validator/:addr/slashes
→ 200 { slashes: [ { id, block_height, reason, evidence_json, stake_before, stake_after, slashed_at } ] }

GET /api/slashing/recent?limit=50
→ 200 { items: [...same shape, plus validator_address] }
```

**Implementation sketch**
- Cap `limit` at 200.
- Order DESC on `slashed_at`.

**Acceptance**
- [ ] Empty → returns `[]`.
- [ ] After a slash event lands → entry visible.

**Verification**
- Insert a row manually, curl endpoint.

---

### TASK-012 — Slash on equivocation

**Section:** chain
**Effort:** L
**Depends on:** TASK-011, TASK-008
**Type:** edit

**Goal**
If the same validator signs two different blocks at the same height (equivocation), that's a slash-able offense. Detect it and reduce stake.

**Files**
- new: `backend/src/blockchain/equivocationDetector.ts` — exports `detectEquivocation(block: Block): Promise<{equivocated: bool, otherHash?: string}>`.
- edit: `backend/src/blockchain/Chain.ts:193` — invoke detector on every accepted block; on hit, write to `validator_slashes` and decrement stake.

**Reuses**
- `chain.getBlockByHash`, validators table.

**Implementation sketch**
- For each accepted block at height H, query if we already have ANOTHER hash at H signed by the same producer (in `blocks` table).
- If yes: insert into `validator_slashes` with evidence `{firstHash, secondHash, height}`.
- `UPDATE validators SET stake = stake - LEAST(stake, 10) WHERE address = $1`.
- Emit `validator_slashed` event.
- Slashing capped at zero (no negative stake).

**Acceptance**
- [ ] Same producer at same height with different hashes → slash row inserted, stake reduced.
- [ ] Same producer at different heights → no slash.

**Verification**
- Force two blocks at same height through addBlock with same producer; check `validator_slashes`.

---

### TASK-013 — validators.stake column + weighted producer selection

**Section:** chain
**Effort:** M
**Depends on:** TASK-311 (column exists)
**Type:** edit

**Goal**
Combine TASK-311's column with TASK-010's hash-based rotation to make heavier-staked validators proposer more often. Stake-weighted lottery instead of uniform.

**Files**
- edit: `backend/src/validators/ValidatorManager.ts:selectProducer` — replace mod-n with stake-weighted pick.

**Reuses**
- `validatorOrder`, plus query `SELECT address, stake FROM validators`.

**Implementation sketch**
- Cache stakes in memory; refresh every 100 blocks (cheap query).
- `cumulative = []`; build a running-sum array of stakes in validatorOrder order.
- `seed mod totalStake` → first index where `cumulative[i] > seed`.
- Same fallback to mod-n when stakes unavailable.

**Acceptance**
- [ ] Validator with 2x stake produces ~2x the blocks over many rounds.
- [ ] Single-validator unchanged.

**Verification**
- Unit test: 10k draws with stakes [1,2,3] yield ~16/33/50% distribution.

---

### TASK-014 — Quorum weight by stake instead of head count

**Section:** chain
**Effort:** M
**Depends on:** TASK-013
**Type:** edit

**Goal**
[ValidatorManager.getConsensus()](backend/src/validators/ValidatorManager.ts) currently counts head approvals: `Math.ceil(n * 2/3)`. With stake, threshold should be `Math.ceil(totalStake * 2/3)` and approvals tallied by stake.

**Files**
- edit: `backend/src/validators/ValidatorManager.ts:getConsensus` — change tally + threshold logic.

**Reuses**
- Cached stakes from TASK-013.

**Implementation sketch**
- `const total = validators.reduce((s, v) => s + getStake(v), 0n)`.
- `const required = (total * 2n + 2n) / 3n` (BigInt ceiling-divide).
- Approval count by sum of approver stakes.
- Default-stake-1 still produces head-count behavior.

**Acceptance**
- [ ] All-stake-1 quorum behaves identically to current.
- [ ] Validator with 51% stake can finalize alone.

**Verification**
- Unit test with mixed stakes.

---

### TASK-015 — Block timestamp drift check (>30s future = reject)

**Section:** chain
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
[Block.isValid](backend/src/blockchain/Block.ts#L153) checks monotonicity vs parent but not absolute future-time. A producer with a fast clock could mint future blocks. Reject blocks with `timestamp > now + 30000`.

**Files**
- edit: `backend/src/blockchain/Block.ts:153-171` — add a `now` parameter, default `Date.now()`, check drift.

**Implementation sketch**
- New signature: `isValid(previousBlock?: Block, now: number = Date.now()): boolean`.
- Add: `if (this.header.timestamp > now + 30_000) return false;`.
- Update existing callers in BlockProducer / ForkManager to pass `Date.now()` or accept default.

**Acceptance**
- [ ] Block with future timestamp 60s ahead → isValid returns false.
- [ ] Block with timestamp now+5s → still valid.

**Verification**
- Unit test: synthesize a future-time block.

---

### TASK-016 — Min block time enforcement (<2s after parent = reject)

**Section:** chain
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
A producer with a backwards clock could mint sub-second blocks. Enforce a 2s minimum delta vs parent.

**Files**
- edit: `backend/src/blockchain/Block.ts:isValid` — add `if (previousBlock && this.header.timestamp - previousBlock.header.timestamp < 2000) return false;`.

**Implementation sketch**
- Replace existing strict `<=` check (line 166) with new `< 2000ms` rule.

**Acceptance**
- [ ] Block 1000ms after parent → invalid.
- [ ] Block 5000ms after parent → valid.

**Verification**
- Unit.

---

### TASK-017 — Difficulty retarget every 100 blocks

**Section:** chain
**Effort:** M
**Depends on:** none
**Type:** edit

**Goal**
[DifficultyManager](backend/src/blockchain/Consensus.ts) has `adjustDifficulty` but it's never invoked. Periodically retarget based on observed block time vs the 10s target.

**Files**
- edit: `backend/src/blockchain/Consensus.ts:DifficultyManager` — add `retarget(observedAvgMs: number, targetMs: number = 10_000): void`.
- edit: `backend/src/blockchain/BlockProducer.ts` — after every 100 blocks, compute observed avg over last 100 timestamps and call `retarget`.

**Reuses**
- `chain.getRecentBlocks(100)` for the observed window.

**Implementation sketch**
- `observedAvg = (blocks[99].ts - blocks[0].ts) / 99`.
- `factor = observedAvg / target`.
- New difficulty = clamp(`current * factor`, [1, 1e9]); adjust by at most 4× per retarget to avoid oscillation.

**Acceptance**
- [ ] After 100 blocks at 5s avg, difficulty ~halves.
- [ ] Bounded swing (max 4× per period).

**Verification**
- Run BlockProducer with synthetic timestamps; observe difficulty adjustment.

---

### TASK-018 — Persist mempool to disk on shutdown, restore on boot

**Section:** chain
**Effort:** M
**Depends on:** none
**Type:** edit

**Goal**
Mempool sits in `pendingTransactions: Map`. Process restart drops it. Persist to disk on shutdown, restore on boot so users don't have to resubmit.

**Files**
- edit: `backend/src/blockchain/TransactionPool.ts` — add `dumpToDisk(): Promise<void>` and `restoreFromDisk(): Promise<number>`.
- edit: `backend/src/api/server.ts` — call dumpToDisk in graceful-shutdown hook (already exists from prior work).
- edit: `backend/src/blockchain/TransactionPool.ts:initialize` — call restoreFromDisk after the existing init.

**Reuses**
- `addTransaction` for re-validation on restore.
- `data/` directory.

**Implementation sketch**
- Dump path: `data/mempool.json` containing array of tx JSON (with bigints stringified).
- On restore: read file, for each tx call `addTransaction` (which re-validates), count successful re-admits, log.
- File deleted after successful restore so partial restart doesn't double-replay.

**Acceptance**
- [ ] Submit 5 txs, shutdown gracefully, restart, all 5 still pending.
- [ ] Crashed shutdown (no dump) → graceful no-op.

**Verification**
- Manual restart sequence.

---

### TASK-019 — Tx replacement-by-fee (same nonce, higher gasPrice replaces)

**Section:** chain
**Effort:** M
**Depends on:** none
**Type:** edit

**Goal**
Standard "RBF": if a sender submits a new tx with the same nonce as a pending one, accept only if `newGasPrice >= oldGasPrice * 1.1`. Otherwise reject as stale.

**Files**
- edit: `backend/src/blockchain/TransactionPool.ts:addTransaction` (line 68) — pre-check for existing-nonce conflict.

**Implementation sketch**
- On `addTransaction`, find existing tx in `pendingTransactions` with same `from` + `nonce`.
- If found: require `tx.gasPrice >= existing.gasPrice * 11n / 10n`. Else reject `replacement gas price too low`.
- If accepted: delete the old tx (and its DB row) before inserting the new.

**Acceptance**
- [ ] Resubmit same nonce + same price → rejected.
- [ ] Resubmit same nonce + 11% higher price → old replaced.
- [ ] Resubmit same nonce + 9% higher price → rejected.

**Verification**
- Three sequential submits with the conditions above.

---

### TASK-020 — Mempool size cap 10k with lowest-gasPrice eviction

**Section:** chain
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
Unbounded mempool is a DoS vector. Cap at 10k. When full, evict the lowest-gasPrice pending tx to make room (assuming the new one is higher).

**Files**
- edit: `backend/src/blockchain/TransactionPool.ts:addTransaction` — after validation, check size; evict if needed.

**Implementation sketch**
- `MEMPOOL_MAX = 10000` (env override `MEMPOOL_MAX_SIZE`).
- If at cap: find min-gasPrice pending; if `newTx.gasPrice > min.gasPrice`, evict min, insert new. Else reject `mempool full and price too low`.

**Acceptance**
- [ ] Filling to 10k + 1 with high-price tx → one evicted.
- [ ] Filling to 10k + 1 with too-low tx → reject.

**Verification**
- Stress test.

---

### TASK-021 — Pending tx TTL 1h

**Section:** chain
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
[TransactionPool.clearExpired](backend/src/blockchain/TransactionPool.ts#L279) is a stub returning 0. Implement: drop pending txs older than 1h (configurable).

**Files**
- edit: `backend/src/blockchain/TransactionPool.ts:clearExpired` — real implementation.
- edit: same — start a 1-min interval calling it.

**Implementation sketch**
- Each pending tx already has a timestamp (`addedAt`); add the field if missing.
- `clearExpired(ageMs = 3_600_000)`: iterate, delete if `now - addedAt > ageMs`.
- Return count cleared.
- Log when count > 0.

**Acceptance**
- [ ] Tx older than 1h disappears from pool.
- [ ] Tx within window stays.

**Verification**
- Inject older `addedAt`, run clearExpired.

---

### TASK-022 — Block size limit 1MB serialized

**Section:** chain
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
Currently only gas-bounded. A pathological block could have 10k tiny txs that fit gas but blow up serialized size. Add a 1MB cap.

**Files**
- edit: `backend/src/blockchain/BlockProducer.ts:produceBlock` — track running serialized size of pushed txs; stop including more when ≥ 1MB.

**Implementation sketch**
- After each tx accepted into validTxs: add `Buffer.byteLength(JSON.stringify(tx))`.
- Stop when ≥ 1_048_576.
- Log `[PRODUCER] block size cap reached at X bytes`.

**Acceptance**
- [ ] Producing a block with > 1MB worth of txs caps at the limit.

**Verification**
- Synthetic load test.

---

### TASK-023 — logs_topic0_idx index migration

**Section:** chain
**Effort:** S
**Depends on:** TASK-310 (logs_jsonb GIN exists)
**Type:** migration

**Goal**
TASK-310 adds GIN over the full logs_json. Topic-0 (event signature) lookups dominate; add a more specific index to make them fast.

**Files**
- new: `backend/src/database/migrations/0017_logs_topic0_idx.sql`

**Migration SQL**
```sql
-- up:
CREATE INDEX IF NOT EXISTS idx_receipts_logs_topic0
  ON receipts USING GIN ((logs_jsonb -> 'topics' -> 0));

-- down:
DROP INDEX IF EXISTS idx_receipts_logs_topic0;
```

**Acceptance**
- [ ] Index visible.
- [ ] `EXPLAIN SELECT * FROM receipts WHERE logs_jsonb @> '[{"topics":["0xabc"]}]'` uses it.

---

### TASK-024 — /api/logs?fromBlock=&toBlock=&address=&topic0=

**Section:** chain
**Effort:** M
**Depends on:** TASK-023
**Type:** new-file

**Goal**
Standard log filtering endpoint matching `eth_getLogs` semantics. Filter by block range, contract address, and indexed topic0.

**Files**
- new: `backend/src/api/logs-query.ts` — exports router.
- edit: `backend/src/api/server.ts` — mount at `/api/logs` (separate from existing `/api/logs` which is the agent log feed; check if collision — if so use `/api/chain/logs`).

**API contract**
```
GET /api/chain/logs?fromBlock=100&toBlock=200&address=0xabc&topic0=0xdef&limit=100
→ 200 { logs: [ { address, topics, data, blockNumber, transactionHash, logIndex } ] }
```

**Implementation sketch**
- All filter params optional except limit (default 100, max 1000).
- Build dynamic SQL using indexed columns first.
- JSONB containment for topic0; address filter via `logs_jsonb @> '[{"address":"..."}]'`.
- Block range via `WHERE block_number BETWEEN $f AND $t`.

**Acceptance**
- [ ] No filters: returns most recent 100 logs.
- [ ] address filter: only logs from that contract.
- [ ] topic0 filter: only matching event signatures.

**Verification**
- Curl with various filter combinations after seed data.

---

### TASK-025 — /api/logs/bloom-check helper

**Section:** chain
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
Block headers carry a bloom filter ([Receipt.ts:logsBloom](backend/src/blockchain/TransactionReceipt.ts)). Clients can pre-filter blocks by checking the bloom before fetching full receipts. Expose the membership check.

**Files**
- new endpoint in `backend/src/api/logs-query.ts`.

**Reuses**
- `bloomContains` from [TransactionReceipt.ts:75-88](backend/src/blockchain/TransactionReceipt.ts#L75-L88).

**API contract**
```
GET /api/chain/logs/bloom-check?height=100&item=0xabc
→ 200 { mightContain: true|false }
```

**Implementation sketch**
- Look up the block by height, read its `logsBloom` (combined from all receipts at calculateReceiptsRoot time — may need to also store on block header).
- Return `bloomContains(bloomHex, item)`.

**Acceptance**
- [ ] Definitely-not-present item → false.
- [ ] Present item → true.
- [ ] Note false-positive rate inherent to bloom.

**Verification**
- Insert a known log, check both true and false cases.

---

### TASK-026 — Block uncles tracking

**Section:** chain
**Effort:** M
**Depends on:** TASK-007
**Type:** edit

**Goal**
Track orphaned-but-valid blocks (uncles) for the GHOST fork-choice rule (TASK-027). Currently orphans are pruned. Keep them in a side table.

**Files**
- new: `backend/src/database/migrations/0018_uncles.sql` — `uncles(block_hash, parent_hash, height, producer, included_in_block_hash, found_at)`.
- edit: `backend/src/blockchain/Chain.ts:handleReorg` — when reverting a block, record it as an uncle of the new canonical block.

**Implementation sketch**
- On reorg, the orphaned blocks become uncles of the same-height canonical block.
- Insert one row per orphaned block.
- `included_in_block_hash` = canonical at that height.

**Acceptance**
- [ ] After reorg, `uncles` table has rows for the orphaned chain.

**Verification**
- Force reorg, query uncles.

---

### TASK-027 — GHOST fork-choice weighting

**Section:** chain
**Effort:** L
**Depends on:** TASK-026
**Type:** edit

**Goal**
[ForkManager.addBlock](backend/src/blockchain/Consensus.ts) currently picks longest chain. GHOST: weight = (canonical depth) + (uncle count under this subtree). The heaviest subtree wins, not just the longest.

**Files**
- edit: `backend/src/blockchain/Consensus.ts:ForkManager.addBlock` — replace longest-chain logic with subtree-weight logic.

**Reuses**
- `uncles` table from TASK-026.

**Implementation sketch**
- For each fork tip, compute weight = blocks-in-fork + uncles-in-fork.
- Switch canonical iff candidate weight > current weight (strict).
- Tie-break by lower-hash for determinism.

**Acceptance**
- [ ] Two equal-length forks, the one with more uncles becomes canonical.

**Verification**
- Synthetic test with engineered uncle counts.

---

### TASK-028 — /api/chain/export?from=&to= NDJSON stream

**Section:** chain
**Effort:** M
**Depends on:** none
**Type:** edit

**Goal**
Operators need a fast way to bulk-export a height range for backup, analytics, or seeding a new node.

**Files**
- new endpoint in `backend/src/api/server.ts` (or a new chain-tools router).

**API contract**
```
GET /api/chain/export?from=0&to=100000
→ 200 (text/plain; application/x-ndjson)
   {"type":"block", ...block.toJSON()}
   {"type":"receipt", ...receipt}
   ... line-delimited
```

**Implementation sketch**
- Use Node `Readable` stream; write one JSON-line per block, then per receipt.
- Don't buffer — write+flush as you go.
- Cap range to 1M blocks (way bigger than current chain but still bounded).

**Acceptance**
- [ ] Streams without buffering full result.
- [ ] Each line valid JSON parsable independently.

**Verification**
- `curl /api/chain/export?from=0&to=10 | jq -c` parses cleanly.

---

### TASK-029 — backend/scripts/import-chain.ts

**Section:** chain
**Effort:** M
**Depends on:** TASK-001, TASK-028
**Type:** script

**Goal**
The inverse of TASK-028: read NDJSON, fromJSON each block, addBlock, plus apply receipts via storeReceipt.

**Files**
- new: `backend/scripts/import-chain.ts`
- edit: `backend/package.json:scripts` — `"chain:import": "ts-node backend/scripts/import-chain.ts"`.

**Implementation sketch**
- Args: `npm run chain:import -- --file path.ndjson --from-stdin`.
- Stream-parse each line, dispatch by type.
- On addBlock failure (parent unknown), buffer + retry once full file read; if still failing, exit 1.

**Acceptance**
- [ ] Import + export round-trip preserves all blocks + receipts.

**Verification**
- Export from one DB, import to fresh DB, compare counts.

---

### TASK-030 — Genesis parameterization via genesis.json

**Section:** chain
**Effort:** M
**Depends on:** none
**Type:** edit

**Goal**
[Chain.ts](backend/src/blockchain/Chain.ts) hardcodes genesis time and producer. Move to a tracked `genesis.json` so testnets/forks can use different params without code change.

**Files**
- new: `backend/genesis.json` — `{ chainId: "hermes-mainnet-1", genesisTimestamp: 1776067200000, genesisProducer: "...", initialAllocations: [{address, balance}, ...] }`.
- edit: `backend/src/blockchain/Chain.ts` — read genesis.json at boot, override defaults.
- edit: `backend/src/blockchain/StateManager.ts:initialize` — apply initialAllocations if state empty.

**Implementation sketch**
- Path resolved relative to repo root or backend/ dir; env `HERMES_GENESIS_FILE` overrides.
- Strict JSON shape; throw on malformed.

**Acceptance**
- [ ] Default genesis.json reproduces current behavior.
- [ ] Custom genesis with different chainId boots a different chain.

**Verification**
- Cold boot with default genesis, observe height-0 state matches expectation.

---

### TASK-031 — Genesis hash verification at boot

**Section:** chain
**Effort:** S
**Depends on:** TASK-030
**Type:** edit

**Goal**
On boot, the chain's genesis block hash must match `genesisHash` in genesis.json. Mismatch = wrong chain config; halt boot rather than corrupt.

**Files**
- edit: `backend/src/blockchain/Chain.ts:initialize` — compute genesis hash from in-memory genesis block, compare to genesis.json field.

**Implementation sketch**
- `genesis.json` gets a `genesisHash` field (deterministic from other fields).
- After loading/creating genesis: assert hash equality. Throw with both hashes printed on mismatch.

**Acceptance**
- [ ] Matching → boots silently.
- [ ] Mismatched → throws on boot, process exits.

**Verification**
- Tweak genesis.json hash, observe boot failure.

---

### TASK-032 — Validator handoff record on rotation

**Section:** chain
**Effort:** S
**Depends on:** TASK-013
**Type:** edit

**Goal**
When the producer changes between blocks (rotation), record the handoff in `consensus_events` for an audit trail.

**Files**
- edit: `backend/src/blockchain/BlockProducer.ts` — after block accepted, if `block.producer != lastBlock.producer`, INSERT a `consensus_events` row.

**Reuses**
- Existing `consensus_events` table.

**Implementation sketch**
- `event_type = 'producer_handoff'`, metadata `{ from, to, height }`.

**Acceptance**
- [ ] Multi-validator chain shows handoff rows in consensus_events.

**Verification**
- After 10 blocks with rotation, query event_type='producer_handoff'.

---

### TASK-033 — Per-block VRF beacon for randomness

**Section:** chain
**Effort:** M
**Depends on:** none
**Type:** edit

**Goal**
Contracts (TASK-076 BLOCKNUMBER/TIMESTAMP/DIFFICULTY) and validators want a tamper-resistant per-block randomness beacon. Use the producer's signature over `(prevHash || height)` as the beacon.

**Files**
- new: `backend/src/blockchain/Beacon.ts` — `computeBeacon(block, producerKeypair): string`.
- edit: `backend/src/blockchain/Block.ts:BlockHeader` — add `beacon?: string` field.
- edit: BlockProducer to attach beacon at production time.

**Reuses**
- `sign()` from [Crypto.ts:97](backend/src/blockchain/Crypto.ts#L97).

**Implementation sketch**
- `beacon = sign(`${prevHash}:${height}`, producerPriv)` — verifiable by anyone.
- VM consumes `beacon` for randomness opcode.

**Acceptance**
- [ ] Beacon present on all newly-produced blocks.
- [ ] Verifiable: `verify(message, beacon, producerPub) === true`.

**Verification**
- Inspect `block.header.beacon`.

---

### TASK-034 — State pruning for zero/dead accounts

**Section:** chain
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
Accounts that have been emptied (balance=0, nonce=0, no code, no storage) bloat the state. Periodically prune them.

**Files**
- new: `backend/src/blockchain/statePruner.ts`
- edit: `backend/src/blockchain/StateManager.ts` — invoke pruner every 1000 blocks.

**Implementation sketch**
- `DELETE FROM accounts WHERE balance = '0' AND nonce = 0 AND (code IS NULL OR code = '') AND storage IS NULL OR storage = '{}'`.
- Log count pruned.
- Skip if it would touch active recent accounts (last 100 blocks of activity) — be conservative.

**Acceptance**
- [ ] Empty accounts vanish after pruning sweep.
- [ ] Active accounts untouched.

**Verification**
- Manually empty an account, run pruner, observe.

---

### TASK-035 — State snapshot every 10k blocks

**Section:** chain
**Effort:** M
**Depends on:** TASK-316 (state_snapshots table)
**Type:** edit

**Goal**
Capture full account + contract_storage state every 10k blocks for fast-sync (TASK-036).

**Files**
- new: `backend/src/blockchain/snapshotWriter.ts`
- edit: BlockProducer to invoke after `commitBlock` when `height % 10000 === 0`.

**Implementation sketch**
- Snapshot blob = gzipped JSON of all rows in `accounts` + `contract_storage` at this height.
- Write to `state_snapshots` table.
- Skip if snapshot already exists for that height (idempotent).

**Acceptance**
- [ ] After 10k blocks, exactly one row in `state_snapshots`.
- [ ] Blob inflates to a JSON object with `accounts[]` and `storage[]`.

**Verification**
- Run to height 10000, query state_snapshots.

---

### TASK-036 — /api/mesh/snapshot/:height fast-sync

**Section:** chain
**Effort:** S
**Depends on:** TASK-035
**Type:** edit

**Goal**
Serve the snapshot blob for a given height so a fresh peer can hydrate without replaying 10k blocks.

**Files**
- edit: `backend/src/network/api.ts` — `GET /api/mesh/snapshot/:height`.

**API contract**
```
GET /api/mesh/snapshot/10000
→ 200 (Content-Type: application/octet-stream)
   <gzipped JSON snapshot blob>
→ 404 { error: 'snapshot not found' }
```

**Acceptance**
- [ ] Returns blob for known snapshot heights.
- [ ] 404 otherwise.

**Verification**
- `curl /api/mesh/snapshot/10000 | gunzip | jq '.accounts | length'`.

---

### TASK-037 — Tx fee distribution: 80% producer, 20% burned

**Section:** chain
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
Currently `applyBlockReward` adds the fixed BLOCK_REWARD. Tx fees are not separately accounted. Split them: 80% credited to producer (along with reward), 20% burned (subtracted from supply).

**Files**
- edit: `backend/src/blockchain/StateManager.ts:applyBlockReward` — accept additional `feeTotal: bigint`; credit producer with `reward + (fee * 80n / 100n)`; track burn separately in chainState.
- edit: `backend/src/blockchain/BlockProducer.ts` — accumulate per-tx fees (`tx.gasPrice * gasUsed`), pass into applyBlockReward.
- edit: `chainState` — add `incrementBurn(amount: bigint)`, `getTotalBurn(): bigint`.

**Acceptance**
- [ ] Producer receives reward + 80% of fees.
- [ ] Total burn tracked.

**Verification**
- After known txs, compare producer balance increment to expected.

---

### TASK-038 — Burn counter on chain stats

**Section:** chain
**Effort:** S
**Depends on:** TASK-037
**Type:** edit

**Goal**
Surface the cumulative burn in `/api/status` and a new `/api/chain/burn` for easy querying.

**Files**
- edit: `backend/src/api/server.ts:/api/status` — add `totalBurn` field.
- new endpoint `GET /api/chain/burn` → `{ totalBurn: '<bigint>', burnRatePerBlock: '<bigint>' }`.

**Acceptance**
- [ ] After fee-bearing blocks, totalBurn > 0.

**Verification**
- `curl /api/chain/burn`.

---

### TASK-039 — Per-validator block reward via env

**Section:** chain
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
[BlockProducer.BLOCK_REWARD](backend/src/blockchain/BlockProducer.ts#L20) is a hardcoded `10e18`. Allow override via env per environment (testnet vs mainnet).

**Files**
- edit: `backend/src/blockchain/BlockProducer.ts:18-20` — read `HERMES_BLOCK_REWARD_WEI` env.

**Implementation sketch**
- Default unchanged.
- Parse as bigint. Throw on non-numeric.

**Acceptance**
- [ ] No env: 10e18.
- [ ] `HERMES_BLOCK_REWARD_WEI=5000000000000000000` → 5e18.

**Verification**
- Boot with env, watch first block reward.

---

### TASK-040 — Coinbase tx representation in receipts

**Section:** chain
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
Block reward is a state credit but no tx represents it. Block explorers can't show "where did this 10 OPEN come from?" Add a synthetic coinbase tx with hash `coinbase:${blockHeight}` and a receipt.

**Files**
- edit: `backend/src/blockchain/BlockProducer.ts` — after applyBlockReward, create + storeReceipt for a synthetic coinbase tx.

**Implementation sketch**
- Synthetic tx: `from='0x0000...coinbase'`, `to=producer.address`, `value=BLOCK_REWARD + producer fee share`, `hash=sha256('coinbase:'+blockHeight)`, `data='coinbase'`.
- Receipt at index 0; shifts other tx indices.
- Don't add to TransactionPool (it's already executed).

**Acceptance**
- [ ] Each block has a coinbase receipt.
- [ ] Sum of receipt values = BLOCK_REWARD + 80% fees.

**Verification**
- Curl receipts for a recent block.

---

### TASK-041 — Migration: index blocks(hash)

**Section:** chain
**Effort:** S
**Depends on:** none
**Type:** migration

**Goal**
`getBlockByHash` performs a full table scan without an index on the hash column. Add it.

**Files**
- new: `backend/src/database/migrations/0019_blocks_hash_idx.sql`

**Migration SQL**
```sql
-- up:
CREATE INDEX IF NOT EXISTS idx_blocks_hash ON blocks(hash);

-- down:
DROP INDEX IF EXISTS idx_blocks_hash;
```

**Acceptance**
- [ ] Index visible.

**Verification**
- `EXPLAIN SELECT * FROM blocks WHERE hash = 'abc';` uses it.

---

### TASK-042 — Tx (from_address, nonce) compound index

**Section:** chain
**Effort:** S
**Depends on:** TASK-307 (already in section 08)
**Type:** migration

**Goal**
This task is satisfied by TASK-307 in section 08 (`backend/src/database/migrations/0003_tx_from_nonce_idx.sql`). No additional migration here — note dependency only.

**Files**
- (covered by TASK-307)

**Acceptance**
- [ ] When section 08 lands, this task closes automatically.

**Verification**
- See TASK-307.

---

### TASK-043 — Account-history rebuild script

**Section:** chain
**Effort:** M
**Depends on:** none
**Type:** script

**Goal**
If state_change events are lost (e.g. fresh DB) but blocks/receipts survive, rebuild per-account history by replaying all txs.

**Files**
- new: `backend/scripts/rebuild-account-history.ts`
- edit: `backend/package.json:scripts` — `"chain:rebuild-history": "..."`.

**Implementation sketch**
- Iterate blocks 0..N.
- For each tx: apply to a fresh in-memory state, log state_change.
- After full replay, write summary per address: total_in, total_out, tx_count.

**Acceptance**
- [ ] Output matches a from-scratch chain.
- [ ] Idempotent.

**Verification**
- Run script, sample one account, compare to live state.

---

### TASK-044 — CLI: npm run verify-chain

**Section:** chain
**Effort:** M
**Depends on:** none
**Type:** script

**Goal**
Sanity check: walk the chain from genesis, verify (parent linkage, block hashes, signatures, state-root reproducibility). Operators run before trusting a chain copy.

**Files**
- new: `backend/scripts/verify-chain.ts`
- edit: `backend/package.json:scripts` — `"verify-chain": "..."`.

**Implementation sketch**
- For each block: `Block.fromJSON(toJSON()).header.hash === current.hash`.
- For each tx: `verifyTransactionSignature` returns true.
- For each receipt: matches `calculateReceiptsRoot`.
- Log pass/fail per block; final summary.
- Exit 1 on any failure.

**Acceptance**
- [ ] Healthy chain → all pass, exit 0.
- [ ] Tampered block → fail, exit 1.

**Verification**
- Run on dev chain.

---

### TASK-045 — State root mismatch alarm event

**Section:** chain
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
If `commitBlock`'s computed state root doesn't match the value the producer baked into the block header (e.g. desync between producer and validator), emit a loud alarm.

**Files**
- edit: `backend/src/blockchain/Chain.ts:addBlock` — after applying tx to local state, compare `stateManager.calculateStateRoot()` vs `block.header.stateRoot`. On mismatch, emit `state_root_mismatch` event.

**Implementation sketch**
- Don't reject the block (it may be ours); just emit the event for monitoring.
- Payload: `{ blockHeight, blockHash, expected, actual, producer }`.

**Acceptance**
- [ ] Event fires on mismatch.
- [ ] Doesn't fire on match.

**Verification**
- Inject a mismatched root manually, observe event.

---

### TASK-046 — Receipt root verification at sync

**Section:** chain
**Effort:** S
**Depends on:** TASK-007
**Type:** edit

**Goal**
On gossip-applied blocks, recompute receipts root from the block's receipts and compare to header. Reject mismatches as malformed.

**Files**
- edit: `backend/src/network/api.ts:/api/mesh/block` — after fromJSON, before addBlock, recompute receipts root, compare. Reject if mismatch.

**Acceptance**
- [ ] Block with valid receipts root → accepted.
- [ ] Tampered receipts → rejected.

**Verification**
- Round-trip with intact, then tampered receipts.

---

### TASK-047 — SSE /api/logs/subscribe?topic0=

**Section:** chain
**Effort:** M
**Depends on:** none
**Type:** new-file

**Goal**
Real-time log stream filtered by topic0. Clients (HUD, contracts, oracles) subscribe and receive new logs as blocks land.

**Files**
- new: `backend/src/api/log-stream.ts`
- mount in server.ts at `/api/chain/logs/subscribe`.

**Reuses**
- `eventBus.on('block_produced', cb)` — extract logs from each block's receipts.
- SSE pattern from [server.ts:971-1057](backend/src/api/server.ts#L971-L1057).

**API contract**
```
GET /api/chain/logs/subscribe?topic0=0xabc
→ Server-Sent Events
   data: { address, topics, data, blockNumber, transactionHash }
```

**Acceptance**
- [ ] Filter by topic0 works.
- [ ] Reconnect resumes from `Last-Event-ID`.

**Verification**
- `curl -N /api/chain/logs/subscribe`, produce a log-bearing block, observe.

---

### TASK-048 — SSE /api/mempool/subscribe

**Section:** chain
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
Stream `transaction_added` and `transaction_removed` events for live mempool view.

**Files**
- new: `backend/src/api/mempool-stream.ts`
- mount at `/api/mempool/subscribe`.

**Reuses**
- `eventBus.on('transaction_added')` and a new `transaction_removed` event emitted by `removeTransactions`.

**Acceptance**
- [ ] Submit tx → event arrives.
- [ ] Tx mined → removal event.

**Verification**
- `curl -N` while submitting txs.

---

### TASK-049 — SSE /api/forks/subscribe

**Section:** chain
**Effort:** S
**Depends on:** TASK-026
**Type:** new-file

**Goal**
Stream `chain_reorg` events with depth + payload.

**Files**
- new: `backend/src/api/fork-stream.ts`
- mount at `/api/forks/subscribe`.

**Acceptance**
- [ ] Reorg → event delivered.

**Verification**
- Force reorg, watch stream.

---

### TASK-050 — Per-block aggregate gas price stats

**Section:** chain
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
Each block's receipts include `gasUsed` per tx and `gasPrice` per tx. Aggregate to `{ p50, p95, max, mean }` for charting (TASK-226).

**Files**
- new: `backend/src/api/chain-stats.ts` — `GET /api/chain/gas-stats?height=N` or `?fromHeight=&toHeight=`.

**Implementation sketch**
- For a single block: aggregate over receipts.
- For a range: same per-block, return array.
- Sort gasPrice values, pick percentiles.

**Acceptance**
- [ ] Returns numeric stats.

**Verification**
- Curl after a couple blocks.

---

### TASK-051 — /api/chain/tps?window=60

**Section:** chain
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
[chain.getRecentTps](backend/src/blockchain/Chain.ts#L344) already exists. Just expose it.

**Files**
- edit: `backend/src/api/server.ts` or `chain-stats.ts` — `GET /api/chain/tps?window=60`.

**Reuses**
- `chain.getRecentTps(windowSec)`.

**API contract**
```
GET /api/chain/tps?window=60
→ 200 { tps: 3.4, window_sec: 60 }
```

**Acceptance**
- [ ] Default window 60.
- [ ] Range param honored.

**Verification**
- Curl.

---

### TASK-052 — /api/chain/block-times histogram

**Section:** chain
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
Distribution of block times (parent.ts → child.ts) over last N blocks.

**Files**
- new endpoint in `backend/src/api/chain-stats.ts`.

**API contract**
```
GET /api/chain/block-times?limit=1000
→ 200 { buckets: [...], counts: [...], mean: 10.2, p95: 13.0 }
```

**Implementation sketch**
- Pull last N blocks, compute deltas, bucket.

**Acceptance**
- [ ] Returns histogram.

**Verification**
- Curl after 100+ blocks.

---

### TASK-053 — Validator uptime metric

**Section:** chain
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
Per-validator uptime = (blocks produced when scheduled) / (blocks scheduled). Surface via existing validators endpoint.

**Files**
- edit: `backend/src/api/server.ts:/api/validators` — extend response with `uptime: number` (0..1).

**Implementation sketch**
- Scheduled = floor(chainHeight / numValidators) per validator (rough; precise needs producer rotation accounting).
- Actual = `blocks_produced` from `validators` table.
- `uptime = actual / scheduled`.

**Acceptance**
- [ ] Validator with 100% production → uptime = 1.

**Verification**
- Curl.

---

### TASK-054 — Mempool depth chart endpoint

**Section:** chain
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
Time-series of mempool size for the HUD chart (TASK-219).

**Files**
- new: `backend/src/blockchain/mempoolHistory.ts` — sample every 10s, keep ring buffer of last 360 samples (1h).
- new endpoint `GET /api/mempool/history`.

**Acceptance**
- [ ] Returns last hour of mempool depth.

**Verification**
- Curl.

---

### TASK-055 — /api/tx/simulate (VM dry-run)

**Section:** chain
**Effort:** M
**Depends on:** none
**Type:** edit

**Goal**
Run a tx through the VM without committing. Returns the would-be receipt + state changes.

**Files**
- new endpoint `POST /api/tx/simulate` in `backend/src/api/server.ts`.

**Reuses**
- `interpreter.execute()` from [vm/Interpreter.ts](backend/src/vm/Interpreter.ts).
- `parseVmProgram`.

**API contract**
```
POST /api/tx/simulate
body: { from, to, value, gasPrice, gasLimit, nonce, data }
→ 200 { gasUsed: '...', logs: [...], status: 'success'|'revert', error?: string }
```

**Implementation sketch**
- For VM tx: parse program, run interpreter against a snapshot of current state.
- For plain transfer: just check balance/nonce, return predicted gasUsed = 21000.

**Acceptance**
- [ ] Simulation matches actual on-chain execution for VM tx.

**Verification**
- Submit same tx via simulate then via /api/transactions; compare.

---

### TASK-056 — /api/tx/estimate-gas

**Section:** chain
**Effort:** S
**Depends on:** TASK-055
**Type:** edit

**Goal**
Subset of simulate that returns just the gasUsed estimate.

**Files**
- new endpoint `POST /api/tx/estimate-gas`.

**Implementation sketch**
- Wrap TASK-055 internals; return only `{ gasEstimate: '<bigint>' }`.

**Acceptance**
- [ ] Returns numeric estimate.

**Verification**
- Curl with a sample VM tx.

---

### TASK-057 — /api/account/:addr/next-nonce

**Section:** chain
**Effort:** S
**Depends on:** TASK-307 (compound index)
**Type:** edit

**Goal**
`next_nonce = max(chain_nonce, max_pending_nonce) + 1`. Wallets need this to avoid nonce conflicts.

**Files**
- new endpoint in `backend/src/api/server.ts`.

**Reuses**
- `stateManager.getNonce(addr)`, query `MAX(nonce)` over pending.

**API contract**
```
GET /api/account/:addr/next-nonce
→ 200 { address, nextNonce: 42 }
```

**Acceptance**
- [ ] No pending → returns chain_nonce + 1.
- [ ] Pending tx → returns max(pending) + 1.

**Verification**
- Curl after submitting a few pending.

---

### TASK-058 — /api/account/:addr/history paginated

**Section:** chain
**Effort:** M
**Depends on:** TASK-307
**Type:** edit

**Goal**
Per-account tx history with cursor pagination.

**Files**
- new endpoint in `backend/src/api/server.ts`.

**API contract**
```
GET /api/account/:addr/history?cursor=&limit=50
→ 200 { items: [...txs...], next_cursor: "..." | null }
```

**Implementation sketch**
- Cursor = base64-encoded `block_height:tx_index` of last item.
- Query `WHERE (from_address = $1 OR to_address = $1) AND (block_height, tx_index) < (cursor) ORDER BY block_height DESC, tx_index DESC LIMIT $2`.

**Acceptance**
- [ ] First page returns latest.
- [ ] Cursor walks back.

**Verification**
- Walk through pages.

---

### TASK-059 — /api/validator/:addr/blocks paginated

**Section:** chain
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
List blocks produced by a specific validator, paginated.

**Files**
- new endpoint.

**API contract**
```
GET /api/validator/:addr/blocks?cursor=&limit=50
→ 200 { items: [{height, hash, timestamp, transactionCount}], next_cursor }
```

**Acceptance**
- [ ] Returns blocks where producer = addr.

**Verification**
- Curl for known validator.

---

### TASK-060 — /api/chain/reorgs (last 50)

**Section:** chain
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
Persist reorg events (currently only emitted on event bus) to a `reorg_log` table; expose recent ones.

**Files**
- new: `backend/src/database/migrations/0020_reorg_log.sql`
- new: handler in `backend/src/api/server.ts` — `GET /api/chain/reorgs?limit=50`.
- edit: `backend/src/blockchain/Chain.ts:handleReorg` — INSERT a row per reorg.

**Migration SQL**
```sql
-- up:
CREATE TABLE IF NOT EXISTS reorg_log (
  id BIGSERIAL PRIMARY KEY,
  occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  depth INTEGER NOT NULL,
  orphaned_count INTEGER NOT NULL,
  added_count INTEGER NOT NULL,
  new_height BIGINT NOT NULL,
  common_ancestor_height BIGINT NOT NULL,
  metadata_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_reorg_log_occurred
  ON reorg_log(occurred_at DESC);

-- down:
DROP INDEX IF EXISTS idx_reorg_log_occurred;
DROP TABLE IF EXISTS reorg_log;
```

**Acceptance**
- [ ] Reorg records inserted.
- [ ] Endpoint returns recent.

**Verification**
- Force reorg, curl endpoint.

---

## Summary

60 tasks: 38 small, 18 medium, 4 large. Mix of new endpoints (~20), edits to existing chain code (~25), new modules (~10), and a handful of migrations + scripts.
