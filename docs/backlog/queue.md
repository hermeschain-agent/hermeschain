# Backlog Queue Index

490 tasks across 13 sections. Each section file holds detailed specs (files, reuse hooks, API contracts, migration SQL, acceptance, verification) for every task in that section. The implementation pass commits one task per commit on the `tier-3-backlog` branch; the paced-push script (`backend/scripts/paced-push.ts`, to be authored) advances `origin/main` by N commits per fire at the configured cadence.

**Plan reference:** `/Users/white_roze/.claude/plans/sunny-tumbling-wind.md`

## Status

| # | Section | Range | Specs | Implemented | File |
|---|---|---|---|---|---|
| 01 | Chain & consensus | TASK-001..060 | 60/60 | 0/60 | [01-chain-consensus.md](queue/01-chain-consensus.md) |
| 02 | VM | TASK-061..105 | 45/45 | 0/45 | [02-vm.md](queue/02-vm.md) |
| 03 | Wallet & accounts | TASK-106..140 | 35/35 | 0/35 | [03-wallet.md](queue/03-wallet.md) |
| 04 | API & explorer | TASK-141..180 | 40/40 | 0/40 | [04-api-explorer.md](queue/04-api-explorer.md) |
| 05 | Agent worker | TASK-181..215 | 35/35 | 0/35 | [05-agent-worker.md](queue/05-agent-worker.md) |
| 06 | Frontend / HUD | TASK-216..265 | 50/50 | 0/50 | [06-frontend-hud.md](queue/06-frontend-hud.md) |
| 07 | Docs & site | TASK-266..305 | 40/40 | 0/40 | [07-docs-site.md](queue/07-docs-site.md) |
| 08 | Database & ops | TASK-306..335 | 30/30 | 0/30 | [08-database-ops.md](queue/08-database-ops.md) |
| 09 | Security | TASK-336..370 | 35/35 | 0/35 | [09-security.md](queue/09-security.md) |
| 10 | Testing | TASK-371..410 | 40/40 | 0/40 | [10-testing.md](queue/10-testing.md) |
| 11 | DX & tooling | TASK-411..445 | 35/35 | 0/35 | [11-dx-tooling.md](queue/11-dx-tooling.md) |
| 12 | Ecosystem stubs | TASK-446..475 | 30/30 | 0/30 | [12-ecosystem.md](queue/12-ecosystem.md) |
| 13 | Final polish | TASK-476..490 | 15/15 | 0/15 | [13-final-polish.md](queue/13-final-polish.md) |
| **TOTAL** | | | **490/490** | **0/490** | |

## Spec format (per task)

Every spec block carries:

- **Section / Effort / Depends on / Type** — quick triage line.
- **Goal** — 1–2 sentences explaining the gap this closes.
- **Files** — new + edits with line ranges.
- **Reuses** — existing functions/patterns to leverage (cited by `path:line`).
- **API contract** or **Migration SQL** — when applicable.
- **Implementation sketch** — 3–8 ordered bullets.
- **Acceptance** — checklist.
- **Verification** — runnable command or concrete observable check.

## Operations

- **Author commits in section order**: 08 → 01 → 02 → 04 → 03 → 09 → 05 → 10 → 06 → 11 → 07 → 12 → 13 (matches the spec-write order; later sections cite earlier task IDs).
- **Push pacing**: 60 commits/day via `backend/scripts/paced-push.ts` reading `data/push_pointer.txt`. Push interval ≈ 24 minutes.
- **Status tracking**: as each implementation commit lands on `main`, mark its `[ ]` Acceptance bullets `[x]` in the section file and bump the **Implemented** column above.

## Costs

Authoring all 490 commits in this session is covered by the user's $100 Claude flat plan (no per-token API charges). The Hermes Railway worker only invokes `git push`, which costs $0 in API credits beyond the trivial scheduling LLM call.

## Quality gate

After spec-expansion completes, randomly pick 10 task IDs across sections and verify:

- Every "Files" path exists or is plausibly new.
- Every "Reuses" reference resolves to a real symbol via grep.
- Every "Verification" line is a runnable command or concrete observable check.
- No spec is shorter than the template's required fields.

≤1 fail = pass.

## Non-goals

- No implementation commits in this branch yet — specs only.
- No re-prioritization of the original 490 list.
- No automation of spec generation by sub-agents — every spec was authored directly so cited file references are accurate, not hallucinated.
