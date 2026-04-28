# Section 10 — Testing Specs (TASK-371..410)

40 tasks. Unit tests across chain/vm/wallet/auth, integration tests covering boot+migration+chain ops, load tests, fuzz tests, property tests, snapshot tests, and a unifying CI workflow.

**Preconditions used throughout:**
- Test runner: `node --test` (per [package.json:test](backend/package.json) — `npm run build && node --test tests/*.test.js`).
- Existing tests: location `backend/tests/`. Pattern: `*.test.ts` compiled to `dist/tests/*.test.js`.
- For new test types, may add `vitest` or keep `node:test`.

---

### TASK-371 — Unit: ValidatorManager rotation

**Section:** testing
**Effort:** S
**Depends on:** TASK-010, TASK-013
**Type:** test

**Goal**
Verify `selectProducer(height, parentHash)` rotates correctly with VRF + stake-weighted modes.

**Files**
- new: `backend/tests/validator-manager.test.ts`.

**Implementation sketch**
- Mock 3 validators with stakes [1,2,3].
- Call selectProducer over many heights, assert distribution within ±10%.

**Acceptance**
- [ ] Distribution test passes.

**Verification**
- `npm test`.

---

### TASK-372 — Unit: ValidatorManager quorum thresholds

**Section:** testing
**Effort:** S
**Depends on:** TASK-014
**Type:** test

**Goal**
Verify quorum math at n=1, 2, 3, 4, 5 with various stake distributions.

**Files**
- new: `backend/tests/validator-quorum.test.ts`.

**Acceptance**
- [ ] All thresholds match expected.

**Verification**
- `npm test`.

---

### TASK-373 — Unit: Interpreter happy path

**Section:** testing
**Effort:** S
**Depends on:** none
**Type:** test

**Goal**
Run the existing fixtures end-to-end on every opcode (overlap with TASK-102).

**Files**
- new/extend: `backend/tests/vm-interpreter-happy.test.ts`.

**Acceptance**
- [ ] All happy-path cases pass.

**Verification**
- `npm test`.

---

### TASK-374 — Unit: Interpreter out-of-gas

**Section:** testing
**Effort:** S
**Depends on:** none
**Type:** test

**Goal**
Each gas-charging op gets a fixture exercising the boundary.

**Files**
- new: `backend/tests/vm-out-of-gas.test.ts`.

**Acceptance**
- [ ] Out-of-gas at expected step.

**Verification**
- `npm test`.

---

### TASK-375 — Unit: Interpreter REVERT

**Section:** testing
**Effort:** S
**Depends on:** none
**Type:** test

**Goal**
Explicit REVERT propagates with reason; storage discarded.

**Files**
- new test file.

**Acceptance**
- [ ] Status revert + storage absent in committed state.

**Verification**
- `npm test`.

---

### TASK-376 — Unit: GasMeter charging

**Section:** testing
**Effort:** S
**Depends on:** none
**Type:** test

**Goal**
Bound, charge, reject-when-empty.

**Files**
- new test file.

**Acceptance**
- [ ] Edge cases pass.

**Verification**
- `npm test`.

---

### TASK-377 — Unit: PeerRegistry stale eviction

**Section:** testing
**Effort:** S
**Depends on:** none
**Type:** test

**Goal**
Add peers with various lastSeen, run eviction, verify outcomes.

**Files**
- new: `backend/tests/peer-registry.test.ts`.

**Acceptance**
- [ ] Eviction matches spec.

**Verification**
- `npm test`.

---

### TASK-378 — Unit: parseVmProgram edge cases

**Section:** testing
**Effort:** S
**Depends on:** none
**Type:** test

**Goal**
Bad JSON, missing prefix, non-array, deeply nested → graceful null.

**Files**
- new test file.

**Acceptance**
- [ ] All inputs handled.

**Verification**
- `npm test`.

---

### TASK-379 — Unit: TransactionPool nonce window

**Section:** testing
**Effort:** S
**Depends on:** TASK-350
**Type:** test

**Goal**
Verify +5 window (TASK-350) accept/reject boundary.

**Files**
- new test file.

**Acceptance**
- [ ] Boundary cases pass.

**Verification**
- `npm test`.

---

### TASK-380 — Unit: TransactionPool replacement-by-fee

**Section:** testing
**Effort:** S
**Depends on:** TASK-019
**Type:** test

**Goal**
RBF acceptance + rejection.

**Files**
- new test file.

**Acceptance**
- [ ] Cases pass.

**Verification**
- `npm test`.

---

### TASK-381 — Unit: StateManager.applyTransaction

**Section:** testing
**Effort:** S
**Depends on:** none
**Type:** test

**Goal**
Balance/nonce updates + insufficient balance + bad nonce.

**Files**
- new test file.

**Acceptance**
- [ ] Cases pass.

**Verification**
- `npm test`.

---

### TASK-382 — Unit: StateManager.revertBlock

**Section:** testing
**Effort:** S
**Depends on:** none
**Type:** test

**Goal**
Apply a block then revert; state matches pre-state.

**Files**
- new test file.

**Acceptance**
- [ ] Round-trip clean.

**Verification**
- `npm test`.

---

### TASK-383 — Unit: createReceipt + bloom

**Section:** testing
**Effort:** S
**Depends on:** none
**Type:** test

**Goal**
Bloom membership: known logs → true; unrelated → mostly false.

**Files**
- new test file.

**Acceptance**
- [ ] Bloom semantics correct.

**Verification**
- `npm test`.

---

### TASK-384 — Unit: Chain.handleReorg

**Section:** testing
**Effort:** M
**Depends on:** none
**Type:** test

**Goal**
Synthesize a reorg scenario; verify state + mempool + receipts after.

**Files**
- new test file.

**Acceptance**
- [ ] Final state matches canonical.

**Verification**
- `npm test`.

---

### TASK-385 — Unit: ForkManager fork-choice

**Section:** testing
**Effort:** M
**Depends on:** TASK-027
**Type:** test

**Goal**
GHOST weighting picks heavier subtree.

**Files**
- new test file.

**Acceptance**
- [ ] Picks correctly with engineered uncle counts.

**Verification**
- `npm test`.

---

### TASK-386 — Unit: Block.isValid

**Section:** testing
**Effort:** S
**Depends on:** TASK-015, TASK-016
**Type:** test

**Goal**
Future-time + min-time + monotonicity edges.

**Files**
- new test file.

**Acceptance**
- [ ] Boundaries correct.

**Verification**
- `npm test`.

---

### TASK-387 — Unit: signature verify ed25519

**Section:** testing
**Effort:** S
**Depends on:** none
**Type:** test

**Goal**
Sign + verify happy path; bad sig + bad key → false.

**Files**
- new test file.

**Acceptance**
- [ ] Cases pass.

**Verification**
- `npm test`.

---

### TASK-388 — Unit: faucet cooldown

**Section:** testing
**Effort:** S
**Depends on:** none
**Type:** test

**Goal**
Two drips within window: second rejected.

**Files**
- new test file.

**Acceptance**
- [ ] Cooldown enforced.

**Verification**
- `npm test`.

---

### TASK-389 — Unit: api-key permission gating

**Section:** testing
**Effort:** S
**Depends on:** TASK-342
**Type:** test

**Goal**
Read-scope key blocked from write routes.

**Files**
- new test file.

**Acceptance**
- [ ] Gating correct.

**Verification**
- `npm test`.

---

### TASK-390 — Unit: migration runner ordering

**Section:** testing
**Effort:** S
**Depends on:** none
**Type:** test

**Goal**
Migrations applied lexicographically; idempotent on re-run.

**Files**
- new test file.

**Acceptance**
- [ ] Order + idempotence.

**Verification**
- `npm test`.

---

### TASK-391 — Integration: boot + migration + insert + read

**Section:** testing
**Effort:** M
**Depends on:** none
**Type:** test

**Goal**
End-to-end smoke: spin up backend with empty PG, apply migrations, insert via API, read via API.

**Files**
- new: `backend/tests/integration/boot-smoke.test.ts`.
- add dep: testcontainers for PG.

**Acceptance**
- [ ] Smoke passes.

**Verification**
- `npm test`.

---

### TASK-392 — Integration: produce 10 blocks, verify receipts persist

**Section:** testing
**Effort:** M
**Depends on:** TASK-391
**Type:** test

**Goal**
Produce blocks with txs, restart backend, verify receipts queryable.

**Files**
- new test file.

**Acceptance**
- [ ] All receipts queryable post-restart.

**Verification**
- `npm test`.

---

### TASK-393 — Integration: reorg verify state matches canonical

**Section:** testing
**Effort:** M
**Depends on:** TASK-007
**Type:** test

**Goal**
Force divergent chains; sync; verify final state matches canonical.

**Files**
- new test file.

**Acceptance**
- [ ] State diff = 0.

**Verification**
- `npm test`.

---

### TASK-394 — Integration: VM tx end-to-end via /api/transactions

**Section:** testing
**Effort:** M
**Depends on:** TASK-082
**Type:** test

**Goal**
Submit `vm:` tx via API; observe receipt with logs + dynamic gas.

**Files**
- new test file.

**Acceptance**
- [ ] Receipt matches expected.

**Verification**
- `npm test`.

---

### TASK-395 — Integration: peer announce + list

**Section:** testing
**Effort:** S
**Depends on:** none
**Type:** test

**Goal**
Two backend instances, each announces to the other.

**Files**
- new test file.

**Acceptance**
- [ ] Both peer lists populated.

**Verification**
- `npm test`.

---

### TASK-396 — Integration: faucet → send → balance

**Section:** testing
**Effort:** S
**Depends on:** none
**Type:** test

**Goal**
Drip, send, observe balance change in destination.

**Files**
- new test file.

**Acceptance**
- [ ] Balances correct.

**Verification**
- `npm test`.

---

### TASK-397 — Integration: api-key creation gated

**Section:** testing
**Effort:** S
**Depends on:** none
**Type:** test

**Goal**
Without admin token: 403; with: 200.

**Files**
- new test file.

**Acceptance**
- [ ] Gating correct.

**Verification**
- `npm test`.

---

### TASK-398 — Integration: SSE stream emits all event types

**Section:** testing
**Effort:** M
**Depends on:** none
**Type:** test

**Goal**
Connect to /api/agent/stream, trigger each event type, observe.

**Files**
- new test file.

**Acceptance**
- [ ] All types observed.

**Verification**
- `npm test`.

---

### TASK-399 — Integration: socket.io rooms

**Section:** testing
**Effort:** S
**Depends on:** TASK-172
**Type:** test

**Goal**
Two clients subscribe to different addresses; tx affects only one.

**Files**
- new test file.

**Acceptance**
- [ ] Routing correct.

**Verification**
- `npm test`.

---

### TASK-400 — Load: 1000 tx/sec submission

**Section:** testing
**Effort:** M
**Depends on:** none
**Type:** test

**Goal**
Sustained load test using k6 or autocannon.

**Files**
- new: `backend/loadtests/tx-submit.k6.js`.
- add dep: dev tool.

**Acceptance**
- [ ] 1000 tx/s for 60s without 5xx.

**Verification**
- `npm run loadtest:tx`.

---

### TASK-401 — Load: 100 concurrent SSE clients

**Section:** testing
**Effort:** M
**Depends on:** none
**Type:** test

**Goal**
Open 100 SSE conns; produce blocks; verify all see events.

**Files**
- new: `backend/loadtests/sse-fanout.k6.js`.

**Acceptance**
- [ ] 100 conns sustained.

**Verification**
- Run.

---

### TASK-402 — Load: peer-mesh announce flood

**Section:** testing
**Effort:** S
**Depends on:** none
**Type:** test

**Goal**
1000 peers announcing per second; verify registry doesn't OOM.

**Files**
- new test.

**Acceptance**
- [ ] Memory bounded.

**Verification**
- Run + monitor.

---

### TASK-403 — Fuzz: VM with random op sequences

**Section:** testing
**Effort:** M
**Depends on:** none
**Type:** test

**Goal**
Generate random valid op programs (via fast-check); execute; verify never crashes (status either success or revert).

**Files**
- new: `backend/tests/fuzz/vm.test.ts`.
- add dep: `fast-check`.

**Acceptance**
- [ ] 10k programs, no crashes.

**Verification**
- `npm test`.

---

### TASK-404 — Fuzz: tx body fields

**Section:** testing
**Effort:** S
**Depends on:** none
**Type:** test

**Goal**
Random tx field values; ensure validation always returns clean accept/reject.

**Files**
- new fuzz test.

**Acceptance**
- [ ] No throw.

**Verification**
- `npm test`.

---

### TASK-405 — Fuzz: API JSON inputs

**Section:** testing
**Effort:** S
**Depends on:** none
**Type:** test

**Goal**
Random JSON bodies to every POST endpoint; assert 4xx not 5xx.

**Files**
- new fuzz test.

**Acceptance**
- [ ] No 5xx in N runs.

**Verification**
- `npm test`.

---

### TASK-406 — Property: state root invariance under reorder-then-reorg

**Section:** testing
**Effort:** M
**Depends on:** none
**Type:** test

**Goal**
Apply N txs in random order; revert; reapply in canonical order; final state root identical.

**Files**
- new property test.

**Acceptance**
- [ ] Property holds for 1000 trials.

**Verification**
- `npm test`.

---

### TASK-407 — Property: gas accounting never exceeds limit

**Section:** testing
**Effort:** S
**Depends on:** none
**Type:** test

**Goal**
For random programs with random gas limits, gasUsed ≤ gasLimit always.

**Files**
- new property test.

**Acceptance**
- [ ] Holds.

**Verification**
- `npm test`.

---

### TASK-408 — Snapshot: API response shapes

**Section:** testing
**Effort:** S
**Depends on:** none
**Type:** test

**Goal**
Snapshot every endpoint's response JSON shape; flag drift.

**Files**
- new: `backend/tests/snapshots/api-shapes.test.ts`.

**Acceptance**
- [ ] Drift surfaced as failed snapshot.

**Verification**
- Modify response, observe failure.

---

### TASK-409 — Snapshot: HUD components

**Section:** testing
**Effort:** M
**Depends on:** none
**Type:** test

**Goal**
React Testing Library + Vitest snapshots of key HUD components.

**Files**
- new: `frontend/tests/snapshots/`.
- add dev deps.

**Acceptance**
- [ ] Snapshots stable.

**Verification**
- `npm test --workspace frontend`.

---

### TASK-410 — CI workflow runs all of the above on PR

**Section:** testing
**Effort:** M
**Depends on:** TASK-371..409
**Type:** new-file

**Goal**
GitHub Actions workflow: install + build + unit + integration + fuzz (small budget) + lint, on PR + push to main.

**Files**
- new: `.github/workflows/ci.yml`.

**Implementation sketch**
- Matrix on Node 20 + 22.
- PG service container for integration tests.
- Cache npm + tsbuild.
- Required for merge.

**Acceptance**
- [ ] PR shows green checks.

**Verification**
- Open test PR.

---

## Summary

40 tasks: 27 small, 13 medium. Heavily small unit tests; medium ones at integration + load + property boundaries.
