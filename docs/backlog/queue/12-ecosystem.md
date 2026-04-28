# Section 12 — Ecosystem Stubs Specs (TASK-446..475)

30 tasks. Standalone explorers + dashboards + widgets, chat bots (Telegram, Discord), notifiers (Slack, email, SMS), webhooks, low-code connectors (Zapier, n8n), monitoring dashboards (Grafana, Datadog, Prometheus rules, PagerDuty), runbooks, chaos tests, DR, multi-region, CDN tuning, asset versioning, npm/brew publish workflows.

---

### TASK-446 — Block explorer minimal v2

**Section:** ecosystem
**Effort:** L
**Depends on:** TASK-273
**Type:** new-file

**Goal**
Standalone explorer site (separate from main HUD) at /explorer. Read-only, indexed.

**Files**
- new: `frontend-explorer/` Vite app.

**Acceptance**
- [ ] Block + tx + account routes work.

**Verification**
- Visit /explorer.

---

### TASK-447 — Validator dashboard standalone

**Section:** ecosystem
**Effort:** M
**Depends on:** TASK-157
**Type:** new-file

**Goal**
Validator-only dashboard for operators.

**Files**
- new: `frontend-validators/` Vite app.

**Acceptance**
- [ ] Shows uptime, pending blocks, slashes.

**Verification**
- Visit.

---

### TASK-448 — Chain stats embedded widget

**Section:** ecosystem
**Effort:** S
**Depends on:** TASK-258
**Type:** new-file

**Goal**
JS embed snippet for third-party sites: `<script src="...embed.js" data-stats="height,tps">`.

**Files**
- new: `frontend/public/embed.js`.

**Acceptance**
- [ ] Embed renders.

**Verification**
- Test in test page.

---

### TASK-449 — Telegram bot /balance + /tx

**Section:** ecosystem
**Effort:** M
**Depends on:** TASK-273
**Type:** new-file

**Goal**
Telegram bot responding to commands.

**Files**
- new: `bots/telegram/` (Node).
- add dep: `node-telegram-bot-api`.

**Acceptance**
- [ ] Commands respond.

**Verification**
- Test in Telegram.

---

### TASK-450 — Discord bot equivalent

**Section:** ecosystem
**Effort:** M
**Depends on:** TASK-273
**Type:** new-file

**Goal**
Same as 449 for Discord.

**Files**
- new: `bots/discord/`.

**Acceptance**
- [ ] Commands respond.

**Verification**
- Test in Discord.

---

### TASK-451 — Slack notifier for own-wallet

**Section:** ecosystem
**Effort:** S
**Depends on:** TASK-454
**Type:** new-file

**Goal**
Slack incoming webhook on tx affecting watched address.

**Files**
- new: `notifiers/slack.ts`.

**Acceptance**
- [ ] Notification posts.

**Verification**
- Send tx.

---

### TASK-452 — Email notifier (SES) for own-wallet

**Section:** ecosystem
**Effort:** S
**Depends on:** TASK-454
**Type:** new-file

**Goal**
AWS SES email on watched-address activity.

**Files**
- new: `notifiers/email.ts`.

**Acceptance**
- [ ] Email arrives.

**Verification**
- Trigger.

---

### TASK-453 — Twilio SMS notifier

**Section:** ecosystem
**Effort:** S
**Depends on:** TASK-454
**Type:** new-file

**Goal**
SMS via Twilio for high-priority alerts.

**Files**
- new: `notifiers/sms.ts`.

**Acceptance**
- [ ] SMS arrives.

**Verification**
- Trigger.

---

### TASK-454 — /api/webhooks subscription

**Section:** ecosystem
**Effort:** M
**Depends on:** none
**Type:** new-file

**Goal**
User registers a URL + filter; we POST events to it.

**Files**
- new: migration `webhooks(id, url, filter_json, secret, active, created_by)`.
- new: `backend/src/api/webhooks.ts` CRUD + delivery worker.

**Acceptance**
- [ ] Webhook fires on matching event.

**Verification**
- Register + trigger.

---

### TASK-455 — Zapier connector spec

**Section:** ecosystem
**Effort:** S
**Depends on:** TASK-454
**Type:** new-file

**Goal**
Zapier app definition (triggers + actions).

**Files**
- new: `integrations/zapier/`.

**Acceptance**
- [ ] App passes Zapier validation.

**Verification**
- Submit.

---

### TASK-456 — n8n node

**Section:** ecosystem
**Effort:** M
**Depends on:** TASK-273
**Type:** new-file

**Goal**
n8n custom node.

**Files**
- new: `integrations/n8n/`.

**Acceptance**
- [ ] Node loads in n8n.

**Verification**
- Install.

---

### TASK-457 — Grafana dashboard JSON

**Section:** ecosystem
**Effort:** S
**Depends on:** TASK-152
**Type:** new-file

**Goal**
Importable Grafana dashboard reading from /api/metrics.

**Files**
- new: `monitoring/grafana/hermes-overview.json`.

**Acceptance**
- [ ] Imports + renders.

**Verification**
- Import in Grafana.

---

### TASK-458 — Datadog monitor JSON

**Section:** ecosystem
**Effort:** S
**Depends on:** TASK-152
**Type:** new-file

**Goal**
Datadog monitor templates.

**Files**
- new: `monitoring/datadog/`.

**Acceptance**
- [ ] Imports.

**Verification**
- Test.

---

### TASK-459 — Prometheus alert rules

**Section:** ecosystem
**Effort:** S
**Depends on:** TASK-152
**Type:** new-file

**Goal**
Alert rules: chain stalled, high reorg rate, queue depth, etc.

**Files**
- new: `monitoring/prometheus/rules.yml`.

**Acceptance**
- [ ] Loads in Prometheus.

**Verification**
- Reload.

---

### TASK-460 — PagerDuty service mapping notes

**Section:** ecosystem
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
Doc on how to wire alerts to PD.

**Files**
- new: `monitoring/pagerduty.md`.

**Acceptance**
- [ ] Doc covers integration steps.

**Verification**
- Review.

---

### TASK-461 — Runbook: db unreachable

**Section:** ecosystem
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
Operator runbook.

**Files**
- new: `runbooks/db-down.md`.

**Acceptance**
- [ ] Step-by-step diagnosis + recovery.

**Verification**
- Review.

---

### TASK-462 — Runbook: agent stuck

**Section:** ecosystem
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
Same.

**Files**
- new: `runbooks/agent-stuck.md`.

**Acceptance**
- [ ] Coverage.

**Verification**
- Review.

---

### TASK-463 — Runbook: chain halted

**Section:** ecosystem
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
Diagnostic + recovery.

**Files**
- new: `runbooks/chain-halted.md`.

**Acceptance**
- [ ] Coverage.

**Verification**
- Review.

---

### TASK-464 — Runbook: peer mesh partitioned

**Section:** ecosystem
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
Diagnostic + recovery.

**Files**
- new: `runbooks/peer-partition.md`.

**Acceptance**
- [ ] Coverage.

**Verification**
- Review.

---

### TASK-465 — Runbook: out-of-disk

**Section:** ecosystem
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
Pruning + extension.

**Files**
- new: `runbooks/disk-full.md`.

**Acceptance**
- [ ] Coverage.

**Verification**
- Review.

---

### TASK-466 — Chaos test: kill worker mid-block

**Section:** ecosystem
**Effort:** M
**Depends on:** TASK-333
**Type:** test

**Goal**
Test that kills the worker process during block production; assert recovery.

**Files**
- new: `backend/tests/chaos/kill-worker.test.ts`.

**Acceptance**
- [ ] State recovers.

**Verification**
- Run.

---

### TASK-467 — Chaos test: drop db connection

**Section:** ecosystem
**Effort:** S
**Depends on:** none
**Type:** test

**Goal**
Disconnect PG mid-write; assert no corruption.

**Files**
- new chaos test.

**Acceptance**
- [ ] No corruption.

**Verification**
- Run.

---

### TASK-468 — Chaos test: clock skew

**Section:** ecosystem
**Effort:** S
**Depends on:** TASK-015
**Type:** test

**Goal**
Skew system clock; assert blocks rejected per TASK-015.

**Files**
- new chaos test.

**Acceptance**
- [ ] Skewed blocks rejected.

**Verification**
- Run.

---

### TASK-469 — Disaster-recovery dry-run

**Section:** ecosystem
**Effort:** M
**Depends on:** TASK-323, TASK-324
**Type:** new-file

**Goal**
Document + script for full DR: backup → wipe → restore → smoke.

**Files**
- new: `runbooks/disaster-recovery.md`.
- new: `backend/scripts/dr-dryrun.ts`.

**Acceptance**
- [ ] Runs end-to-end.

**Verification**
- Quarterly drill.

---

### TASK-470 — Multi-region deploy notes

**Section:** ecosystem
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
How to deploy across regions; latency considerations.

**Files**
- new: `docs/ops/multi-region.md`.

**Acceptance**
- [ ] Coverage.

**Verification**
- Review.

---

### TASK-471 — CDN caching headers tuning

**Section:** ecosystem
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
Set Cache-Control on static assets for CDN.

**Files**
- edit: server.ts static handler.

**Acceptance**
- [ ] Headers correct.

**Verification**
- Curl.

---

### TASK-472 — Static-asset versioning

**Section:** ecosystem
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
Hashed filenames so CDN cache busts on update.

**Files**
- edit: build config.

**Acceptance**
- [ ] Filenames include hash.

**Verification**
- Build.

---

### TASK-473 — SDK npm publish workflow

**Section:** ecosystem
**Effort:** S
**Depends on:** TASK-273
**Type:** new-file

**Goal**
GitHub Action that publishes SDK on tag push.

**Files**
- new: `.github/workflows/publish-sdk.yml`.

**Acceptance**
- [ ] Tag triggers publish.

**Verification**
- Tag.

---

### TASK-474 — CLI npm publish workflow

**Section:** ecosystem
**Effort:** S
**Depends on:** TASK-280
**Type:** new-file

**Goal**
Same for CLI.

**Files**
- new: workflow.

**Acceptance**
- [ ] Triggers.

**Verification**
- Tag.

---

### TASK-475 — Brew tap formula

**Section:** ecosystem
**Effort:** S
**Depends on:** TASK-280
**Type:** new-file

**Goal**
`brew install hermeschain/hermes/hermes` formula.

**Files**
- new: `Formula/hermes.rb` in tap repo.

**Acceptance**
- [ ] brew install works.

**Verification**
- Install.

---

## Summary

30 tasks: 23 small, 6 medium, 1 large. Mostly integration-layer + ops tooling.
