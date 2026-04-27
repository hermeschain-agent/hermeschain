# Section 05 — Agent Worker Specs (TASK-181..215)

35 tasks. Task priority + dependency + effort tracking, retry/timeout/budget, skill registry + versioning + rate-limit, verification gates (typecheck/test/prettier) + auto-rollback, PR-mode workflow + branch-per-task + auto-rebase + commitlint + co-author + DCO, agent identity rotation + per-area expertise, cross-task memory + per-task post-mortem + learning corpus.

**Preconditions used throughout:**
- Agent worker: [backend/src/agent/AgentWorker.ts](backend/src/agent/AgentWorker.ts).
- Task backlog: [TaskBacklog.ts](backend/src/agent/TaskBacklog.ts), [TaskSources.ts](backend/src/agent/TaskSources.ts).
- Git: [GitIntegration.ts](backend/src/agent/GitIntegration.ts).
- CI monitor: [CIMonitor.ts](backend/src/agent/CIMonitor.ts).
- Skills: [SkillManager.ts](backend/src/agent/SkillManager.ts).
- Executor: [AgentExecutor.ts](backend/src/agent/AgentExecutor.ts).
- LLM: [hermesClient.ts](backend/src/llm/hermesClient.ts).

---

### TASK-181 — Task priority queue (urgent / normal / chore)

**Section:** agent
**Effort:** S
**Depends on:** none
**Type:** edit + migration

**Goal**
Three-tier priority. Urgent always first; normal next; chore when nothing else.

**Files**
- new: `backend/src/database/migrations/0024_agent_tasks_priority.sql` — `ALTER TABLE agent_tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('urgent','normal','chore'));`
- edit: `TaskBacklog.ts` — order pending by priority CASE then created_at.

**Acceptance**
- [ ] Urgent task picked before normal regardless of age.

**Verification**
- Insert mixed-priority queue, observe order.

---

### TASK-182 — Task dependency graph

**Section:** agent
**Effort:** M
**Depends on:** TASK-181
**Type:** edit + migration

**Goal**
A task can declare `depends_on: [taskId, ...]`. Worker skips it until all deps are status='completed'.

**Files**
- new: migration `0025_agent_task_deps.sql` — `agent_task_deps(task_id, depends_on, PK(task_id, depends_on))`.
- edit: TaskBacklog.getNextTask query — `WHERE NOT EXISTS (SELECT 1 FROM agent_task_deps d JOIN agent_tasks t ON t.id = d.depends_on WHERE d.task_id = at.id AND t.status != 'completed')`.

**Acceptance**
- [ ] Task with unmet dep: skipped.
- [ ] After dep completes: picked up.

**Verification**
- Two-task chain.

---

### TASK-183 — Task estimated + actual effort tracking

**Section:** agent
**Effort:** S
**Depends on:** none
**Type:** edit + migration

**Goal**
Track planned vs actual minutes per task for retrospective.

**Files**
- new: migration adding `estimated_minutes`, `actual_minutes` columns.
- edit: AgentWorker — record actual_minutes on completion.

**Acceptance**
- [ ] Both columns populate.

**Verification**
- Check after task.

---

### TASK-184 — Task retry on transient failure

**Section:** agent
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
Distinguish transient (network, rate-limit) from permanent (bug, missing dep). Retry transient up to 3 times with exponential backoff.

**Files**
- edit: AgentWorker.ts — on caught error, classify, increment retry count.

**Implementation sketch**
- Transient: retry; permanent: fail.
- Backoff: 1m, 5m, 15m.

**Acceptance**
- [ ] Network error retried.
- [ ] Logic error fails immediately.

**Verification**
- Inject errors of each kind.

---

### TASK-185 — Task timeout 30min

**Section:** agent
**Effort:** S
**Depends on:** TASK-333
**Type:** edit

**Goal**
Hard cap on per-task wall time. Kill execution + recovery sweep handles cleanup (TASK-333).

**Files**
- edit: AgentWorker.ts — wrap task execution in `Promise.race` with 30min timeout.

**Acceptance**
- [ ] Task exceeding 30min: terminated.

**Verification**
- Inject sleep task.

---

### TASK-186 — Per-task token budget

**Section:** agent
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
Cap LLM tokens per task. Default 50k.

**Files**
- edit: AgentExecutor.ts — track running token count via response usage; abort if cap exceeded.

**Acceptance**
- [ ] 50k+ token task aborts.

**Verification**
- Force a giant task.

---

### TASK-187 — Cumulative daily token budget

**Section:** agent
**Effort:** S
**Depends on:** TASK-186
**Type:** edit

**Goal**
Global cap (e.g. 5M tokens/day) so a runaway can't drain Anthropic credits.

**Files**
- edit: hermesClient.ts — refuse calls when daily cap hit.

**Implementation sketch**
- Redis counter `tokens:daily:${date}`.
- Read before each call; abort if over.

**Acceptance**
- [ ] At cap: subsequent calls return error.

**Verification**
- Set low cap, exhaust, observe.

---

### TASK-188 — /api/agent/tokens/stream SSE

**Section:** agent
**Effort:** S
**Depends on:** TASK-186
**Type:** new-file

**Goal**
Real-time stream of token usage for the HUD cost ticker (TASK-244).

**Files**
- new SSE endpoint.

**API contract**
```
GET /api/agent/tokens/stream
event: usage
data: { taskId, inputTokens, outputTokens, costUsd }
```

**Acceptance**
- [ ] Each LLM call emits an event.

**Verification**
- Curl, observe.

---

### TASK-189 — Cost estimate per task

**Section:** agent
**Effort:** S
**Depends on:** TASK-186
**Type:** edit

**Goal**
After completion, write `estimated_cost_usd` to agent_tasks based on token usage × model price.

**Files**
- new column + price table in code.
- edit: AgentWorker on completion.

**Acceptance**
- [ ] Cost field populated.

**Verification**
- Check post-task.

---

### TASK-190 — Task rejection reason logging

**Section:** agent
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
When a task is skipped (deps unmet, gates failed), log to a `task_rejections` table with reason.

**Files**
- new migration + INSERT in TaskBacklog.

**Acceptance**
- [ ] Rejections traceable.

**Verification**
- Force a rejection.

---

### TASK-191 — Skill registry persistence

**Section:** agent
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
[SkillManager](backend/src/agent/SkillManager.ts) currently holds skills in-memory. Persist set of loaded + enabled skills.

**Files**
- new migration `agent_skills(id PK, name, version, enabled, loaded_at)`.
- edit: SkillManager to read/write.

**Acceptance**
- [ ] Restart preserves enable/disable state.

**Verification**
- Disable, restart, check.

---

### TASK-192 — Skill versioning + hot-reload

**Section:** agent
**Effort:** M
**Depends on:** TASK-191
**Type:** edit

**Goal**
Each skill has semver. Reload picks up new code without restart.

**Files**
- edit: SkillManager.

**Implementation sketch**
- File watcher on skills directory.
- Reload + bump version on change.

**Acceptance**
- [ ] Edit + save: skill rebuilds in seconds.

**Verification**
- Edit a skill, observe.

---

### TASK-193 — Per-skill rate limit

**Section:** agent
**Effort:** S
**Depends on:** TASK-191
**Type:** edit

**Goal**
Some skills are expensive. Rate-limit per skill (e.g. browser automation: 10/min).

**Files**
- edit: SkillManager invoke path — Redis counter per skill.

**Acceptance**
- [ ] Over-rate skill call: rejected with 429-style error.

**Verification**
- Loop invocations.

---

### TASK-194 — /api/skills discovery

**Section:** agent
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
Already exists at server.ts:744. Verify completeness; add `description`, `version`, `rateLimit`, `lastUsedAt` fields.

**Files**
- edit: existing handler.

**Acceptance**
- [ ] All fields present.

**Verification**
- Curl.

---

### TASK-195 — Skill source viewer endpoint

**Section:** agent
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
Show skill source code for inspection.

**Files**
- new: `GET /api/skills/:id/source` (admin-gated).

**Acceptance**
- [ ] Returns source file content.

**Verification**
- Curl.

---

### TASK-196 — /api/agent/tools log dump

**Section:** agent
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
Recent tool invocations with args + results for debugging.

**Files**
- new endpoint.

**API contract**
```
GET /api/agent/tools?since=&limit=100
→ 200 { items: [{ tool, args, result, durationMs, ts }] }
```

**Acceptance**
- [ ] Returns recent tool calls.

**Verification**
- Curl.

---

### TASK-197 — Verification: typecheck after every code edit

**Section:** agent
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
After each agent file edit, run `tsc --noEmit -p .` on the affected package.

**Files**
- edit: AgentExecutor file-write path — invoke typecheck.

**Acceptance**
- [ ] Typecheck failure blocks task completion.

**Verification**
- Force a type error, observe.

---

### TASK-198 — Verification: tests on changed packages

**Section:** agent
**Effort:** S
**Depends on:** TASK-197
**Type:** edit

**Goal**
Run package tests of any package whose files were modified.

**Files**
- edit: AgentExecutor.

**Acceptance**
- [ ] Test failures block.

**Verification**
- Force a test failure.

---

### TASK-199 — Verification: prettier

**Section:** agent
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
After each edit, run `prettier --write` on changed files.

**Files**
- edit: AgentExecutor.

**Acceptance**
- [ ] Files formatted post-edit.

**Verification**
- Inspect agent commits.

---

### TASK-200 — Auto-rollback on verification failure

**Section:** agent
**Effort:** M
**Depends on:** TASK-197, TASK-198
**Type:** edit

**Goal**
If verification fails, `git reset --hard HEAD` to discard the bad changes.

**Files**
- edit: AgentExecutor catch path.

**Acceptance**
- [ ] Failed task: working tree restored.

**Verification**
- Force failure, check git status.

---

### TASK-201 — PR-mode toggle

**Section:** agent
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
Env `AGENT_PR_MODE=true` switches commits → branch + PR instead of direct main.

**Files**
- edit: GitIntegration.ts.

**Acceptance**
- [ ] PR mode opens PR via gh CLI.

**Verification**
- Toggle env, run task.

---

### TASK-202 — PR template generator from task

**Section:** agent
**Effort:** S
**Depends on:** TASK-201
**Type:** edit

**Goal**
Generate PR title + body from task title + description + verification steps.

**Files**
- edit: GitIntegration createPR path.

**Acceptance**
- [ ] PR has structured body.

**Verification**
- Open PR.

---

### TASK-203 — PR auto-link to task ID

**Section:** agent
**Effort:** S
**Depends on:** TASK-202
**Type:** edit

**Goal**
PR title includes `(TASK-NNN)` and body links to a tracker URL.

**Files**
- edit: PR template.

**Acceptance**
- [ ] PR title format: `feat: ... (TASK-NNN)`.

**Verification**
- Open PR.

---

### TASK-204 — Squash-merge agent for stacked commits

**Section:** agent
**Effort:** S
**Depends on:** TASK-201
**Type:** edit

**Goal**
When merging via gh, use `--squash`.

**Files**
- edit: GitIntegration mergePR.

**Acceptance**
- [ ] Merged PR has 1 commit on main.

**Verification**
- Merge.

---

### TASK-205 — Branch-per-task workflow

**Section:** agent
**Effort:** S
**Depends on:** TASK-201
**Type:** edit

**Goal**
Branch name `agent/TASK-NNN/<slug>` per task.

**Files**
- edit: GitIntegration branch create.

**Acceptance**
- [ ] Each task creates its own branch.

**Verification**
- List branches.

---

### TASK-206 — Auto-rebase on main before push

**Section:** agent
**Effort:** S
**Depends on:** TASK-205
**Type:** edit

**Goal**
Before pushing PR branch, rebase on latest main to keep linear history.

**Files**
- edit: GitIntegration push path.

**Acceptance**
- [ ] Pushed branches are rebased.

**Verification**
- Push, inspect.

---

### TASK-207 — Conflict-resolution prompt to LLM

**Section:** agent
**Effort:** M
**Depends on:** TASK-206
**Type:** edit

**Goal**
On rebase conflict, send conflict region + base + ours + theirs to LLM for resolution suggestion.

**Files**
- edit: GitIntegration.

**Implementation sketch**
- Parse conflict markers.
- Construct prompt; get suggested resolution; apply if confident.
- Otherwise leave for human.

**Acceptance**
- [ ] Simple conflict resolved.

**Verification**
- Synthetic conflict.

---

### TASK-208 — Commitlint enforcement

**Section:** agent
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
Enforce conventional-commits (`feat: ...`, `fix: ...`, etc.) on every agent commit.

**Files**
- new: `commitlint.config.js`.
- edit: GitIntegration commit path — validate before write.

**Acceptance**
- [ ] Non-conventional message: rejected.

**Verification**
- Manual test.

---

### TASK-209 — Co-author tag on every agent commit

**Section:** agent
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
Already present per recent commits; codify in GitIntegration.

**Files**
- edit: GitIntegration commit message builder.

**Acceptance**
- [ ] All commits include Co-Authored-By trailer.

**Verification**
- `git log | grep Co-Authored`.

---

### TASK-210 — Sign-off (DCO) tag

**Section:** agent
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
Add `Signed-off-by: Hermes Agent <agent@hermeschain>` for DCO compliance.

**Files**
- edit: GitIntegration.

**Acceptance**
- [ ] Trailer present.

**Verification**
- Log inspection.

---

### TASK-211 — Agent identity rotation per file area

**Section:** agent
**Effort:** M
**Depends on:** none
**Type:** edit

**Goal**
Different "personas" for backend/frontend/docs commits; each persona has its own author identity.

**Files**
- edit: GitIntegration — pick author by file path.

**Implementation sketch**
- Mapping `backend/* → Hermes Backend Agent`, `frontend/* → Hermes Frontend Agent`, `docs/* → Hermes Scribe`.

**Acceptance**
- [ ] Commits authored by appropriate persona.

**Verification**
- Inspect log.

---

### TASK-212 — Per-area expertise routing

**Section:** agent
**Effort:** M
**Depends on:** TASK-211
**Type:** edit

**Goal**
Route task to the persona whose area best matches; load area-specific system prompt.

**Files**
- edit: AgentWorker getNextTask + executor system prompt selection.

**Acceptance**
- [ ] Frontend tasks use frontend-tuned prompt.

**Verification**
- Inspect prompt logs.

---

### TASK-213 — Cross-task memory

**Section:** agent
**Effort:** M
**Depends on:** none
**Type:** edit

**Goal**
Already exists in agent_memory; ensure recent insights flow into new task's context.

**Files**
- edit: AgentExecutor system prompt assembly.

**Implementation sketch**
- Pull top 10 most-relevant memories (by tag match against task title) and embed in prompt.

**Acceptance**
- [ ] Memories appear in prompt.

**Verification**
- Inspect prompt.

---

### TASK-214 — Per-task post-mortem 1-line

**Section:** agent
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
After every task, ask LLM for a 1-sentence post-mortem; save to agent_memory.

**Files**
- edit: AgentWorker completion hook.

**Acceptance**
- [ ] post-mortem present per task.

**Verification**
- Query agent_memory.

---

### TASK-215 — Learning corpus index

**Section:** agent
**Effort:** M
**Depends on:** TASK-214
**Type:** new-file

**Goal**
Vector-store index over post-mortems for retrieval-augmented prompting.

**Files**
- new: `backend/src/agent/learningCorpus.ts`.
- add dep: a local embedding model or use Anthropic embeddings (via api).

**Implementation sketch**
- On save, embed; on retrieve, k-NN.

**Acceptance**
- [ ] Relevant past insights surfaced for new tasks.

**Verification**
- Manual.

---

## Summary

35 tasks: 22 small, 11 medium. Heavy infra around verification gates + git workflow.
