# Section 07 — Docs & Site Specs (TASK-266..305)

40 tasks. Landing tagline, /docs pages (architecture, consensus, vm, api, sdk), SDK packages (TS, Python, Rust) + CLI, examples, tutorials, whitepaper, glossary, FAQ, roadmap, contributing, style guide, code of conduct, threat model, security.txt, bug bounty, status page, press kit.

---

### TASK-266 — Landing page tagline rewrite

**Section:** docs
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
Refresh the landing tagline to reflect current state (not aspirational).

**Files**
- edit: `frontend/src/App.tsx` landing section.

**Acceptance**
- [ ] New tagline reflects shipped tier-3 features.

**Verification**
- Visual review.

---

### TASK-267 — /docs/architecture rewrite

**Section:** docs
**Effort:** M
**Depends on:** none
**Type:** new-file

**Goal**
Comprehensive architecture overview with diagrams.

**Files**
- new: `docs/architecture/overview.md`.

**Acceptance**
- [ ] Page covers all major subsystems.

**Verification**
- Review.

---

### TASK-268 — /docs/consensus page

**Section:** docs
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
Consensus algorithm reference: producer rotation, quorum, finality, slashing.

**Files**
- new: `docs/consensus.md`.

**Acceptance**
- [ ] Page complete.

**Verification**
- Review.

---

### TASK-269 — /docs/vm spec page

**Section:** docs
**Effort:** S
**Depends on:** TASK-103
**Type:** docs

**Goal**
Already covered by TASK-103. Linkage doc.

**Files**
- (covered)

**Acceptance**
- [ ] Linked from /docs index.

**Verification**
- Click.

---

### TASK-270 — /docs/api reference

**Section:** docs
**Effort:** S
**Depends on:** TASK-141, TASK-142
**Type:** edit

**Goal**
Markdown wrapper that embeds Swagger UI.

**Files**
- new: `docs/api.md` linking to /docs (Swagger).

**Acceptance**
- [ ] Page links to live Swagger.

**Verification**
- Visit.

---

### TASK-271 — /docs/sdk page

**Section:** docs
**Effort:** S
**Depends on:** TASK-273
**Type:** new-file

**Goal**
SDK overview with install + quickstart.

**Files**
- new: `docs/sdk.md`.

**Acceptance**
- [ ] Page complete.

**Verification**
- Review.

---

### TASK-272 — SDK quickstart code samples (TS + Python)

**Section:** docs
**Effort:** S
**Depends on:** TASK-273, TASK-278
**Type:** new-file

**Goal**
Five-line quickstart per language: install, init client, get balance.

**Files**
- new: `docs/sdk/quickstart-ts.md`, `docs/sdk/quickstart-py.md`.

**Acceptance**
- [ ] Samples runnable.

**Verification**
- Run.

---

### TASK-273 — SDK npm package skeleton

**Section:** docs
**Effort:** M
**Depends on:** none
**Type:** new-file

**Goal**
Publishable `@hermeschain/sdk` npm package.

**Files**
- new: `sdk/typescript/package.json`, `index.ts`, etc.

**Acceptance**
- [ ] `npm pack` produces tarball.

**Verification**
- npm pack.

---

### TASK-274 — SDK chain client class

**Section:** docs
**Effort:** M
**Depends on:** TASK-273
**Type:** edit

**Goal**
`HermesClient` class with methods for blocks/txs/accounts.

**Files**
- new: `sdk/typescript/src/client.ts`.

**Acceptance**
- [ ] Methods covered by sample.

**Verification**
- Run sample.

---

### TASK-275 — SDK wallet helper

**Section:** docs
**Effort:** S
**Depends on:** TASK-273
**Type:** edit

**Goal**
Keypair creation + signing helpers.

**Files**
- new: `sdk/typescript/src/wallet.ts`.

**Acceptance**
- [ ] Helpers callable.

**Verification**
- Sample.

---

### TASK-276 — SDK VM helper for op programs

**Section:** docs
**Effort:** S
**Depends on:** TASK-273
**Type:** edit

**Goal**
Builder API: `program().push(1).push(2).add().log({...}).stop().build()`.

**Files**
- new: `sdk/typescript/src/vm.ts`.

**Acceptance**
- [ ] Builder produces valid programs.

**Verification**
- Run sample.

---

### TASK-277 — SDK signed-tx builder

**Section:** docs
**Effort:** S
**Depends on:** TASK-275
**Type:** edit

**Goal**
`buildAndSignTx({ from, to, value, ...}, privateKey)` → signed payload.

**Files**
- new: `sdk/typescript/src/tx.ts`.

**Acceptance**
- [ ] Output accepted by API.

**Verification**
- Submit + observe.

---

### TASK-278 — Python SDK skeleton

**Section:** docs
**Effort:** M
**Depends on:** none
**Type:** new-file

**Goal**
Publishable `hermeschain` PyPI package.

**Files**
- new: `sdk/python/setup.cfg`, `hermeschain/`.

**Acceptance**
- [ ] `pip install -e .` works.

**Verification**
- pip.

---

### TASK-279 — Rust SDK skeleton

**Section:** docs
**Effort:** M
**Depends on:** none
**Type:** new-file

**Goal**
Publishable crate.

**Files**
- new: `sdk/rust/Cargo.toml`, `src/lib.rs`.

**Acceptance**
- [ ] `cargo build` works.

**Verification**
- cargo.

---

### TASK-280 — CLI tool `hermes` npm bin

**Section:** docs
**Effort:** S
**Depends on:** TASK-273
**Type:** new-file

**Goal**
`@hermeschain/cli` package providing `hermes` command.

**Files**
- new: `cli/package.json`, `bin/hermes.ts`.

**Acceptance**
- [ ] `npx hermes --help` lists commands.

**Verification**
- npx.

---

### TASK-281 — CLI: hermes balance <addr>

**Section:** docs
**Effort:** S
**Depends on:** TASK-280
**Type:** edit

**Goal**
Print balance.

**Files**
- edit: cli.

**Acceptance**
- [ ] Returns numeric.

**Verification**
- Run.

---

### TASK-282 — CLI: hermes send <to> <amount>

**Section:** docs
**Effort:** S
**Depends on:** TASK-280
**Type:** edit

**Goal**
Submit a tx.

**Files**
- edit: cli.

**Acceptance**
- [ ] Returns tx hash.

**Verification**
- Run + observe.

---

### TASK-283 — CLI: hermes call <contract> <method>

**Section:** docs
**Effort:** S
**Depends on:** TASK-280
**Type:** edit

**Goal**
Read-only contract call.

**Files**
- edit: cli.

**Acceptance**
- [ ] Returns result.

**Verification**
- Run.

---

### TASK-284 — CLI: hermes deploy <program.json>

**Section:** docs
**Effort:** S
**Depends on:** TASK-280
**Type:** edit

**Goal**
Deploy contract from JSON-op file.

**Files**
- edit: cli.

**Acceptance**
- [ ] Returns address.

**Verification**
- Run.

---

### TASK-285 — CLI: hermes node start (local node)

**Section:** docs
**Effort:** M
**Depends on:** TASK-280
**Type:** edit

**Goal**
Start a local Hermeschain node for dev.

**Files**
- edit: cli — invoke backend in dev mode with sqlite/in-memory PG.

**Acceptance**
- [ ] Node boots locally.

**Verification**
- Run.

---

### TASK-286 — /examples/counter walkthrough

**Section:** docs
**Effort:** S
**Depends on:** TASK-105
**Type:** docs

**Goal**
Already covered. Linkage.

**Files**
- (covered)

**Acceptance**
- [ ] Linked.

**Verification**
- Click.

---

### TASK-287 — /examples/erc20-like walkthrough

**Section:** docs
**Effort:** S
**Depends on:** TASK-105
**Type:** docs

**Goal**
Same as 286.

**Files**
- (covered)

**Acceptance**
- [ ] Linked.

**Verification**
- Click.

---

### TASK-288 — /examples/multisig walkthrough

**Section:** docs
**Effort:** S
**Depends on:** TASK-105
**Type:** docs

**Goal**
Same.

**Files**
- (covered)

**Acceptance**
- [ ] Linked.

**Verification**
- Click.

---

### TASK-289 — /examples/oracle walkthrough

**Section:** docs
**Effort:** M
**Depends on:** TASK-105
**Type:** new-file

**Goal**
Worked oracle (push price feed) example.

**Files**
- new: `examples/oracle/`.

**Acceptance**
- [ ] Deploys + works.

**Verification**
- Run.

---

### TASK-290 — Tutorial: build your first contract

**Section:** docs
**Effort:** S
**Depends on:** TASK-104, TASK-280
**Type:** new-file

**Goal**
Step-by-step from blank to deployed counter.

**Files**
- new: `docs/tutorials/first-contract.md`.

**Acceptance**
- [ ] Tutorial complete.

**Verification**
- Walk through.

---

### TASK-291 — Tutorial: run your own validator

**Section:** docs
**Effort:** S
**Depends on:** TASK-013
**Type:** new-file

**Goal**
Setup guide.

**Files**
- new: `docs/tutorials/run-validator.md`.

**Acceptance**
- [ ] Tutorial complete.

**Verification**
- Walk through.

---

### TASK-292 — Tutorial: query the chain

**Section:** docs
**Effort:** S
**Depends on:** TASK-273
**Type:** new-file

**Goal**
SDK + API examples.

**Files**
- new: `docs/tutorials/query.md`.

**Acceptance**
- [ ] Tutorial complete.

**Verification**
- Walk.

---

### TASK-293 — Tutorial: submit a tx from a script

**Section:** docs
**Effort:** S
**Depends on:** TASK-277
**Type:** new-file

**Goal**
Build + sign + submit walkthrough.

**Files**
- new: `docs/tutorials/submit-tx.md`.

**Acceptance**
- [ ] Tutorial complete.

**Verification**
- Walk.

---

### TASK-294 — Whitepaper draft v0.1

**Section:** docs
**Effort:** L
**Depends on:** TASK-267, TASK-268, TASK-269
**Type:** new-file

**Goal**
PDF/MD whitepaper covering motivation, design, security, roadmap.

**Files**
- new: `docs/whitepaper/v0.1.md`.

**Acceptance**
- [ ] Draft complete.

**Verification**
- Review.

---

### TASK-295 — Glossary page

**Section:** docs
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
Define every term used.

**Files**
- new: `docs/glossary.md`.

**Acceptance**
- [ ] Comprehensive.

**Verification**
- Review.

---

### TASK-296 — FAQ page

**Section:** docs
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
Answer common questions.

**Files**
- new: `docs/faq.md`.

**Acceptance**
- [ ] 20+ Qs.

**Verification**
- Review.

---

### TASK-297 — Roadmap page

**Section:** docs
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
Public roadmap.

**Files**
- new: `docs/roadmap.md`.

**Acceptance**
- [ ] Tier 1-3 visible.

**Verification**
- Review.

---

### TASK-298 — Contributing guide

**Section:** docs
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
How to contribute.

**Files**
- new: `CONTRIBUTING.md`.

**Acceptance**
- [ ] Covers dev setup, PR flow.

**Verification**
- Review.

---

### TASK-299 — Style guide for agent-authored code

**Section:** docs
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
Conventions for files written by the agent.

**Files**
- new: `docs/style-guide.md`.

**Acceptance**
- [ ] Covers naming, imports, comments.

**Verification**
- Review.

---

### TASK-300 — Code of conduct

**Section:** docs
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
Standard COC.

**Files**
- new: `CODE_OF_CONDUCT.md`.

**Acceptance**
- [ ] CoC present.

**Verification**
- Review.

---

### TASK-301 — Threat model document

**Section:** docs
**Effort:** M
**Depends on:** none
**Type:** new-file

**Goal**
STRIDE-style threat model.

**Files**
- new: `docs/security/threat-model.md`.

**Acceptance**
- [ ] All trust boundaries covered.

**Verification**
- Review.

---

### TASK-302 — Disclosure / security.txt

**Section:** docs
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
RFC 9116 security.txt.

**Files**
- new: `frontend/public/.well-known/security.txt`.

**Acceptance**
- [ ] Path returns text.

**Verification**
- Curl.

---

### TASK-303 — Bug bounty page

**Section:** docs
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
Scope, severity tiers, payouts.

**Files**
- new: `docs/security/bug-bounty.md`.

**Acceptance**
- [ ] Page complete.

**Verification**
- Review.

---

### TASK-304 — Status page stub

**Section:** docs
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
Static status page (manually updated for now).

**Files**
- new: `frontend/src/pages/Status.tsx`.

**Acceptance**
- [ ] Page renders.

**Verification**
- Visit.

---

### TASK-305 — Press kit (logos, screenshots)

**Section:** docs
**Effort:** S
**Depends on:** TASK-434
**Type:** new-file

**Goal**
Public press-kit zip.

**Files**
- new: `frontend/public/press-kit.zip` + `docs/press.md`.

**Acceptance**
- [ ] Downloadable.

**Verification**
- Curl.

---

## Summary

40 tasks: 32 small, 7 medium, 1 large. Heavy docs cluster.
