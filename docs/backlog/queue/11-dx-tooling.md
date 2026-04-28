# Section 11 — DX & Tooling Specs (TASK-411..445)

35 tasks. Lint/format/hooks, conventional-commits, dependabot/renovate, tsconfig hardening, path aliases, env validation, dev containers, Makefile/justfile, badges/diagrams, logos/icons, sitemap/robots, lighthouse + bundle-size budgets, dynamic imports, Sentry/Logflare integration.

---

### TASK-411 — ESLint config tightening

**Section:** dx
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
Standard ESLint config across backend + frontend; enforce no-unused-vars, no-explicit-any (warn), import order.

**Files**
- new: `.eslintrc.cjs` at root.
- add deps: eslint, @typescript-eslint/*.

**Acceptance**
- [ ] `npm run lint` passes after config + fixes.

**Verification**
- Run.

---

### TASK-412 — Prettier config

**Section:** dx
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
Single source of truth for formatting.

**Files**
- new: `.prettierrc`.
- add dep: prettier.

**Acceptance**
- [ ] `prettier --check .` passes after format.

**Verification**
- Run.

---

### TASK-413 — Husky pre-commit

**Section:** dx
**Effort:** S
**Depends on:** TASK-411, TASK-412
**Type:** new-file

**Goal**
Pre-commit hook runs lint + typecheck on staged files.

**Files**
- new: `.husky/pre-commit`.
- add dep: husky.

**Acceptance**
- [ ] Bad commit blocked.

**Verification**
- Try bad commit.

---

### TASK-414 — lint-staged setup

**Section:** dx
**Effort:** S
**Depends on:** TASK-413
**Type:** new-file

**Goal**
Run lint+format only on staged files.

**Files**
- new: lint-staged config.

**Acceptance**
- [ ] Only staged files processed.

**Verification**
- Stage a file.

---

### TASK-415 — Commitlint conventional-commits

**Section:** dx
**Effort:** S
**Depends on:** TASK-413
**Type:** new-file

**Goal**
Enforce conventional commits via commit-msg hook.

**Files**
- new: `commitlint.config.js`, `.husky/commit-msg`.

**Acceptance**
- [ ] Bad message blocked.

**Verification**
- Try bad message.

---

### TASK-416 — Renovate bot config

**Section:** dx
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
Auto PRs for dep upgrades.

**Files**
- new: `renovate.json`.

**Acceptance**
- [ ] Renovate detects.

**Verification**
- Wait for first PR.

---

### TASK-417 — Dependabot config

**Section:** dx
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
GitHub-native dep update + security alerts.

**Files**
- new: `.github/dependabot.yml`.

**Acceptance**
- [ ] Dependabot active.

**Verification**
- Inspect.

---

### TASK-418 — tsconfig strict mode on

**Section:** dx
**Effort:** M
**Depends on:** none
**Type:** edit

**Goal**
Enable `strict: true` in both tsconfigs; fix surfaced errors.

**Files**
- edit: `backend/tsconfig.json`, `frontend/tsconfig.json`.

**Acceptance**
- [ ] Build clean with strict on.

**Verification**
- `npm run build`.

---

### TASK-419 — tsconfig noUncheckedIndexedAccess

**Section:** dx
**Effort:** M
**Depends on:** TASK-418
**Type:** edit

**Goal**
Catches `arr[i]` returning T|undefined.

**Files**
- edit: tsconfigs.

**Acceptance**
- [ ] Build clean after fixes.

**Verification**
- Build.

---

### TASK-420 — Path aliases (@chain, @api)

**Section:** dx
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
Replace `../../../blockchain/...` with `@chain/...`.

**Files**
- edit: tsconfigs `paths` + Vite/build configs.

**Acceptance**
- [ ] Imports resolve.

**Verification**
- Build.

---

### TASK-421 — Build-time env validation (zod)

**Section:** dx
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
At boot, validate env vars against zod schema; fail-fast on missing required.

**Files**
- new: `backend/src/config/env.ts`.

**Acceptance**
- [ ] Missing required: clear error.

**Verification**
- Boot without var.

---

### TASK-422 — dotenv example file refresh

**Section:** dx
**Effort:** S
**Depends on:** TASK-421
**Type:** edit

**Goal**
`.env.example` listing all known vars with description.

**Files**
- edit: `.env.example` (or create).

**Acceptance**
- [ ] All vars documented.

**Verification**
- Diff against schema.

---

### TASK-423 — Docker Compose backend+postgres+redis

**Section:** dx
**Effort:** M
**Depends on:** none
**Type:** new-file

**Goal**
One-command local dev: `docker compose up`.

**Files**
- new: `docker-compose.yml`.

**Acceptance**
- [ ] All three services up.

**Verification**
- `docker compose up`.

---

### TASK-424 — Devcontainer config

**Section:** dx
**Effort:** S
**Depends on:** TASK-423
**Type:** new-file

**Goal**
VS Code devcontainer for cloud + local consistency.

**Files**
- new: `.devcontainer/devcontainer.json`.

**Acceptance**
- [ ] Open in container works.

**Verification**
- Try in VS Code.

---

### TASK-425 — Makefile shortcuts

**Section:** dx
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
`make dev`, `make test`, `make build`, `make clean`.

**Files**
- new: `Makefile`.

**Acceptance**
- [ ] All targets work.

**Verification**
- Run each.

---

### TASK-426 — justfile alternative

**Section:** dx
**Effort:** S
**Depends on:** TASK-425
**Type:** new-file

**Goal**
Same targets via `just` (preferred by some).

**Files**
- new: `justfile`.

**Acceptance**
- [ ] Targets match Makefile.

**Verification**
- Run.

---

### TASK-427 — nvmrc file

**Section:** dx
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
Pin Node 20.

**Files**
- new: `.nvmrc` containing `20`.

**Acceptance**
- [ ] `nvm use` switches.

**Verification**
- nvm.

---

### TASK-428 — Volta pin

**Section:** dx
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
`"volta"` field in package.json with node + npm versions.

**Files**
- edit: package.json.

**Acceptance**
- [ ] Volta picks up.

**Verification**
- volta which node.

---

### TASK-429 — README badges

**Section:** dx
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
Build + coverage + license + version badges.

**Files**
- edit: README.md.

**Acceptance**
- [ ] Badges render.

**Verification**
- View on GitHub.

---

### TASK-430 — Architecture Mermaid diagram

**Section:** dx
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
Mermaid diagram of backend → DB → chain → agent in README.

**Files**
- edit: README.md.

**Acceptance**
- [ ] Diagram renders on GitHub.

**Verification**
- View.

---

### TASK-431 — Block production sequence diagram

**Section:** dx
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
Mermaid sequence: BlockProducer → Pool → State → Validator → Chain.

**Files**
- new: `docs/diagrams/block-production.md`.

**Acceptance**
- [ ] Renders.

**Verification**
- View.

---

### TASK-432 — Reorg sequence diagram

**Section:** dx
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
Mermaid sequence for reorg flow.

**Files**
- new: `docs/diagrams/reorg.md`.

**Acceptance**
- [ ] Renders.

**Verification**
- View.

---

### TASK-433 — Agent task sequence diagram

**Section:** dx
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
Mermaid sequence for AgentWorker pick → execute → commit.

**Files**
- new: `docs/diagrams/agent-task.md`.

**Acceptance**
- [ ] Renders.

**Verification**
- View.

---

### TASK-434 — Logo refresh

**Section:** dx
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
SVG logo + variants in `frontend/public/`.

**Files**
- new: logo files.

**Acceptance**
- [ ] Used in HUD + landing.

**Verification**
- Visual.

---

### TASK-435 — Favicon refresh

**Section:** dx
**Effort:** S
**Depends on:** TASK-434
**Type:** new-file

**Goal**
ICO + PNG variants.

**Files**
- new: favicon files + manifest links.

**Acceptance**
- [ ] Tab icon updates.

**Verification**
- Browser.

---

### TASK-436 — og:image generator

**Section:** dx
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
Server-rendered OG image showing chain height + uptime for social cards.

**Files**
- new: endpoint `GET /og/og-image.png`.

**Acceptance**
- [ ] Image renders.

**Verification**
- Curl.

---

### TASK-437 — Sitemap.xml

**Section:** dx
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
Generated sitemap covering /docs and main routes.

**Files**
- new: `frontend/public/sitemap.xml` (or generated).

**Acceptance**
- [ ] Valid XML.

**Verification**
- Validator.

---

### TASK-438 — robots.txt

**Section:** dx
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
Allow indexing of public, disallow /admin, /api.

**Files**
- new: `frontend/public/robots.txt`.

**Acceptance**
- [ ] File present.

**Verification**
- Curl.

---

### TASK-439 — Lighthouse score ≥ 90 on landing

**Section:** dx
**Effort:** M
**Depends on:** TASK-260, TASK-261
**Type:** edit

**Goal**
Audit landing; iterate until LH score ≥ 90 on perf + a11y + best-practices.

**Files**
- edit: as needed.

**Acceptance**
- [ ] Score ≥ 90.

**Verification**
- LH report.

---

### TASK-440 — Bundle-size budget enforcement

**Section:** dx
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
CI checks frontend bundle ≤ N KB.

**Files**
- new: `.github/workflows/bundle-budget.yml`.
- new: `bundlesize.config.json`.

**Acceptance**
- [ ] Over-budget PR fails.

**Verification**
- Inflate bundle, observe.

---

### TASK-441 — Tree-shake unused exports

**Section:** dx
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
Audit + remove unused exports.

**Files**
- edit: across codebase.
- new tool: `ts-prune` in scripts.

**Acceptance**
- [ ] ts-prune output minimal.

**Verification**
- Run.

---

### TASK-442 — Dynamic imports for HUD heavy panels

**Section:** dx
**Effort:** M
**Depends on:** none
**Type:** edit

**Goal**
Code-split heavy components (charts, peer map) so initial bundle stays small.

**Files**
- edit: components → React.lazy.

**Acceptance**
- [ ] Initial bundle smaller.

**Verification**
- Bundle analyzer.

---

### TASK-443 — Frontend Sentry integration

**Section:** dx
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
Capture frontend errors.

**Files**
- edit: frontend entry.
- add dep: `@sentry/react`.

**Acceptance**
- [ ] Errors land in Sentry.

**Verification**
- Throw test error.

---

### TASK-444 — Backend Sentry integration

**Section:** dx
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
Capture backend exceptions.

**Files**
- edit: server.ts.
- add dep: `@sentry/node`.

**Acceptance**
- [ ] Errors captured.

**Verification**
- Throw.

---

### TASK-445 — Logflare / Axiom integration

**Section:** dx
**Effort:** S
**Depends on:** TASK-147
**Type:** new-file

**Goal**
Forward access log NDJSON to Logflare or Axiom.

**Files**
- edit: accessLog.ts to also stream to forwarder.

**Acceptance**
- [ ] Log lines appear in destination.

**Verification**
- Check dashboard.

---

## Summary

35 tasks: 28 small, 7 medium. Most are config + setup tasks.
