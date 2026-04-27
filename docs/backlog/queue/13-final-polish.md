# Section 13 — Final Polish Specs (TASK-476..490)

15 tasks. Changelog, release tag + notes, screencast + onboarding video, public roadmap board, issue/PR templates, discussion categories, RSS feed, newsletter signup, Discord invite, Twitter card meta, social proof live counter, tagline A/B test.

---

### TASK-476 — CHANGELOG file (auto from conventional commits)

**Section:** polish
**Effort:** S
**Depends on:** TASK-415
**Type:** new-file

**Goal**
`CHANGELOG.md` generated from conventional commits via `conventional-changelog-cli`.

**Files**
- new: `CHANGELOG.md` (initial).
- new: npm script `release:changelog`.

**Acceptance**
- [ ] Generates from commits.

**Verification**
- Run.

---

### TASK-477 — v0.3 release tag

**Section:** polish
**Effort:** S
**Depends on:** TASK-476
**Type:** edit

**Goal**
Tag the post-tier-3 release.

**Files**
- (git operation)

**Acceptance**
- [ ] Tag pushed.

**Verification**
- `git tag -l v0.3`.

---

### TASK-478 — Release notes blog post

**Section:** polish
**Effort:** S
**Depends on:** TASK-477
**Type:** new-file

**Goal**
Markdown blog post highlighting tier-3 features.

**Files**
- new: `docs/blog/v0.3.md`.

**Acceptance**
- [ ] Post complete.

**Verification**
- Review.

---

### TASK-479 — Demo screencast

**Section:** polish
**Effort:** S
**Depends on:** none
**Type:** docs

**Goal**
2-3 min screencast embedded on landing.

**Files**
- new: `frontend/public/demo.mp4` + landing embed.

**Acceptance**
- [ ] Plays inline.

**Verification**
- Visit.

---

### TASK-480 — Onboarding video

**Section:** polish
**Effort:** S
**Depends on:** TASK-298
**Type:** docs

**Goal**
Contributor onboarding walkthrough.

**Files**
- new: link in CONTRIBUTING.md.

**Acceptance**
- [ ] Linked.

**Verification**
- Click.

---

### TASK-481 — Public roadmap board

**Section:** polish
**Effort:** S
**Depends on:** TASK-297
**Type:** new-file

**Goal**
GitHub Projects board mirroring TASK status.

**Files**
- (GitHub config)

**Acceptance**
- [ ] Board public + populated.

**Verification**
- Visit.

---

### TASK-482 — Issue templates (bug/feature/security)

**Section:** polish
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
GitHub issue templates.

**Files**
- new: `.github/ISSUE_TEMPLATE/{bug,feature,security}.md`.

**Acceptance**
- [ ] Templates appear.

**Verification**
- New issue.

---

### TASK-483 — PR template

**Section:** polish
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
PR description template.

**Files**
- new: `.github/PULL_REQUEST_TEMPLATE.md`.

**Acceptance**
- [ ] Template appears.

**Verification**
- New PR.

---

### TASK-484 — Discussion categories on GitHub

**Section:** polish
**Effort:** S
**Depends on:** none
**Type:** docs

**Goal**
Configure Discussions: Q&A, Ideas, Show & Tell.

**Files**
- (GitHub config)

**Acceptance**
- [ ] Categories present.

**Verification**
- Visit.

---

### TASK-485 — RSS feed for blog/changelog

**Section:** polish
**Effort:** S
**Depends on:** TASK-476, TASK-478
**Type:** new-file

**Goal**
Generated RSS at /feed.xml.

**Files**
- new: build step.

**Acceptance**
- [ ] Valid RSS.

**Verification**
- Validator.

---

### TASK-486 — Newsletter signup endpoint

**Section:** polish
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
`POST /api/newsletter` storing emails (then forward to Mailchimp/Buttondown).

**Files**
- new: `backend/src/api/newsletter.ts` + migration.

**Acceptance**
- [ ] Stored.

**Verification**
- Submit.

---

### TASK-487 — Discord invite on landing

**Section:** polish
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
Permanent Discord invite link prominently displayed.

**Files**
- edit: landing.

**Acceptance**
- [ ] Link visible + works.

**Verification**
- Click.

---

### TASK-488 — Twitter card meta refresh

**Section:** polish
**Effort:** S
**Depends on:** TASK-436
**Type:** edit

**Goal**
twitter:card / og: meta tags using og:image generator.

**Files**
- edit: HTML template.

**Acceptance**
- [ ] Twitter card validator passes.

**Verification**
- Validator.

---

### TASK-489 — Social proof: live commit counter

**Section:** polish
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
Landing widget showing live commit count from GitHub API.

**Files**
- edit: landing component.

**Acceptance**
- [ ] Shows accurate count.

**Verification**
- Visual.

---

### TASK-490 — Tagline rotation A/B test

**Section:** polish
**Effort:** S
**Depends on:** TASK-266
**Type:** edit

**Goal**
Show one of N taglines per visitor; track which converts (signup).

**Files**
- edit: landing.
- new: tracking endpoint.

**Acceptance**
- [ ] Rotation + tracking works.

**Verification**
- Visits across multiple sessions.

---

## Summary

15 tasks: 15 small. Quick polish + comms cluster.
