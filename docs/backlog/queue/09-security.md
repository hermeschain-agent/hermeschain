# Section 09 — Security Specs (TASK-336..370)

35 tasks. CSRF + Helmet + body-size + rate-limit overrides, API-key scoping/expiry/rotation/audit, admin-token rotation, lockout + suspicious feed, replay protection (chainId + nonce), wallet-export rate limit + obscured display, log redaction, secrets scan + dep audit + CodeQL + Snyk, CSP nonces + SRI, HTTPS-only + cookie flags, mnemonic encryption at rest, KMS stub, Tor/VPN flag, ip2geo, threat-feed, cert-pinning notes, disclosure response template.

**Preconditions used throughout:**
- Auth: [backend/src/api/auth.ts](backend/src/api/auth.ts) — `requireApiKey`, `ipRateLimit`.
- Crypto helpers in [Crypto.ts](backend/src/blockchain/Crypto.ts).
- Server middleware stack in [server.ts](backend/src/api/server.ts).

---

### TASK-336 — CSRF protection on POST endpoints

**Section:** security
**Effort:** M
**Depends on:** none
**Type:** new-file

**Goal**
State-changing routes need CSRF protection. Issue per-session token; reject mismatched.

**Files**
- new: `backend/src/api/middleware/csrf.ts`.
- edit: server.ts — apply to all non-API-key POST routes.

**Implementation sketch**
- Double-submit cookie pattern: server sets `csrf-token` cookie + expects `X-CSRF-Token` header to match.
- API-key authenticated routes exempt (token-based already).

**Acceptance**
- [ ] POST without token: 403.
- [ ] With matching token: passes.

**Verification**
- Curl with/without header.

---

### TASK-337 — Helmet middleware (CSP, HSTS, frameguard)

**Section:** security
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
Standard security headers via `helmet`.

**Files**
- edit: server.ts — `app.use(helmet({...}))`.
- add dep: `helmet`.

**Implementation sketch**
- Default config + custom CSP allowing self + Sentry + analytics.
- HSTS max-age 1 year, includeSubDomains.

**Acceptance**
- [ ] `curl -I /` shows X-Frame-Options, Strict-Transport-Security, Content-Security-Policy.

**Verification**
- Inspect headers.

---

### TASK-338 — SQL-injection audit pass

**Section:** security
**Effort:** M
**Depends on:** none
**Type:** edit

**Goal**
Audit every `db.query` callsite for string concatenation; convert any to parameterized.

**Files**
- new: `backend/scripts/audit-sql-injection.ts` — grep `db.query` callsites for `+ req.` or template string with `${req.`.
- edit: any flagged callsites.

**Acceptance**
- [ ] Audit script returns 0 hits.

**Verification**
- Run script.

---

### TASK-339 — Input length caps on every endpoint

**Section:** security
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
Per-field max length to block oversized inputs.

**Files**
- new: `backend/src/api/middleware/inputCaps.ts`.

**Implementation sketch**
- Generic middleware checking `req.body` field by field against schema (use zod or hand-rolled).
- Reject 413 with field name on overflow.

**Acceptance**
- [ ] 10MB string in any field → 413.

**Verification**
- Curl with huge field.

---

### TASK-340 — JSON body size limit

**Section:** security
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
Cap total JSON body to 1MB via express.json options.

**Files**
- edit: server.ts:81 — `express.json({ limit: '1mb' })`.

**Acceptance**
- [ ] 2MB body: 413.

**Verification**
- Curl.

---

### TASK-341 — Per-endpoint rate limit overrides

**Section:** security
**Effort:** S
**Depends on:** TASK-144
**Type:** edit

**Goal**
Different routes need different rates. `ipRateLimit(60)` for chat vs `ipRateLimit(600)` for /api/blocks.

**Files**
- edit: auth.ts — already supports per-call rate; document + apply selectively in server.ts.

**Acceptance**
- [ ] Chat limited to 60/min; reads to 600/min.

**Verification**
- Curl loops.

---

### TASK-342 — API-key scope chain:write vs chain:read

**Section:** security
**Effort:** M
**Depends on:** none
**Type:** edit

**Goal**
Currently API keys have boolean permissions. Add granular scopes: `chain:read`, `chain:write`, `wallet:send`, `keys:create`, `jobs:write`, `admin`.

**Files**
- new: migration adding `permissions` JSONB column to `api_keys`.
- edit: `requireApiKey(scope)` middleware to check scope inclusion.

**Acceptance**
- [ ] Read-scope key: blocked from write routes.

**Verification**
- Mint key with read-only, attempt write.

---

### TASK-343 — API-key expiry default 90d

**Section:** security
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
New keys expire 90 days from creation unless overridden.

**Files**
- edit: `POST /auth/keys` to set `expires_at`.

**Acceptance**
- [ ] Expired keys: rejected with 401.

**Verification**
- Backdate, attempt use.

---

### TASK-344 — API-key rotation endpoint

**Section:** security
**Effort:** S
**Depends on:** TASK-343
**Type:** new-file

**Goal**
Rotate a key in place: same permissions, new secret, old gracefully expires in 24h.

**Files**
- new: `POST /auth/keys/:id/rotate` → returns new secret.

**Acceptance**
- [ ] Old key still valid for 24h; new key works immediately.

**Verification**
- Rotate + use both for 24h.

---

### TASK-345 — API-key audit log

**Section:** security
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
Log every key creation, rotation, deletion to a tamper-evident audit table.

**Files**
- new: migration `api_key_audit(id, key_id, action, actor, metadata, occurred_at)`.
- edit: auth router to write audit row on every key change.

**Acceptance**
- [ ] All key changes appear in audit log.

**Verification**
- Mint + delete key, query audit.

---

### TASK-346 — Admin-token rotation flow

**Section:** security
**Effort:** S
**Depends on:** none
**Type:** docs

**Goal**
Document procedure for rotating `ADMIN_TOKEN` env without downtime.

**Files**
- new: `docs/security/admin-token-rotation.md`.

**Implementation sketch**
- Set `ADMIN_TOKEN_SECONDARY` to new value; both work.
- Restart with new as primary; remove old after deploy.

**Acceptance**
- [ ] Doc exists with step-by-step.

**Verification**
- Manual.

---

### TASK-347 — Failed-auth lockout (5 in 1min → 15min block)

**Section:** security
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
Brute-force defense: 5 failures in 1 min from same IP → 15 min block.

**Files**
- edit: auth.ts.

**Implementation sketch**
- Redis counter `auth:fail:${ip}` with 60s TTL.
- On count > 5: set `auth:block:${ip}` with 900s TTL; reject with 429.

**Acceptance**
- [ ] 6th failure within minute: blocked for 15 min.

**Verification**
- Loop bad creds.

---

### TASK-348 — Suspicious-activity feed

**Section:** security
**Effort:** S
**Depends on:** TASK-347
**Type:** new-file

**Goal**
Stream auth failures, rate-limit hits, blocked IPs to ops channel.

**Files**
- new: `GET /api/security/suspicious` (admin-gated).

**API contract**
```
→ 200 { items: [{ type, ip, reason, ts }] }
```

**Acceptance**
- [ ] Returns recent suspicious events.

**Verification**
- Curl after triggering events.

---

### TASK-349 — Tx replay protection: chainId

**Section:** security
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
Tx must include chainId; reject mismatched. Prevents cross-chain replay.

**Files**
- edit: TransactionPool.validateTransaction — check `tx.chainId === HERMES_CHAIN_ID`.

**Acceptance**
- [ ] Wrong chainId: rejected.

**Verification**
- Submit with wrong id.

---

### TASK-350 — Tx replay protection: per-key nonce window tightening

**Section:** security
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
Currently nonce window is +10 from current. Tighten to +5; reject txs outside.

**Files**
- edit: TransactionPool.validateTransaction.

**Acceptance**
- [ ] Nonce > current+5: rejected.

**Verification**
- Submit far-future nonce.

---

### TASK-351 — Wallet-export rate limit 1/min

**Section:** security
**Effort:** S
**Depends on:** TASK-107
**Type:** edit

**Goal**
Mnemonic export at most once per minute per address.

**Files**
- edit: TASK-107 endpoint.

**Acceptance**
- [ ] Second export within 60s: 429.

**Verification**
- Two exports in row.

---

### TASK-352 — Mnemonic display obscured + reveal button

**Section:** security
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
HUD shows mnemonic as `••••••• ••••••• ...`; click-to-reveal.

**Files**
- edit: relevant frontend component (TASK-231 area).

**Acceptance**
- [ ] Mnemonic hidden by default in UI.

**Verification**
- Visual.

---

### TASK-353 — Server log redaction

**Section:** security
**Effort:** M
**Depends on:** none
**Type:** new-file

**Goal**
Wrap `console.log/warn/error` to scrub: API keys, signatures, mnemonics, private keys, JWT.

**Files**
- new: `backend/src/utils/safeLog.ts` — exports `safeLog.{info,warn,error}` that scrubs.

**Implementation sketch**
- Regex set: `/sk_[a-zA-Z0-9]{32,}/`, `/[A-Za-z0-9+/]{86}=/` (base58 sig length), `/(?:\b\w+\s){11}\w+/` (potential mnemonic).
- Replace matches with `[REDACTED]`.

**Acceptance**
- [ ] Log line containing API key emerges with `[REDACTED]`.

**Verification**
- Unit.

---

### TASK-354 — Secrets scan in CI (gitleaks)

**Section:** security
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
Add gitleaks to CI workflow; block PRs that introduce secrets.

**Files**
- new: `.github/workflows/secrets-scan.yml`.

**Acceptance**
- [ ] PR with synthetic secret: scan fails.

**Verification**
- Test PR.

---

### TASK-355 — Dependency audit on PR (npm audit)

**Section:** security
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
CI step `npm audit --audit-level=high` blocking on high+ vulnerabilities.

**Files**
- new: `.github/workflows/npm-audit.yml`.

**Acceptance**
- [ ] PR introducing vulnerable dep: fails.

**Verification**
- Manual.

---

### TASK-356 — CodeQL workflow on push

**Section:** security
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
GitHub CodeQL static analysis weekly + on push.

**Files**
- new: `.github/workflows/codeql.yml`.

**Acceptance**
- [ ] CodeQL runs on push.

**Verification**
- Push, view Actions.

---

### TASK-357 — Snyk integration

**Section:** security
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
Snyk dependency + container scan on PR.

**Files**
- new: `.github/workflows/snyk.yml`.

**Acceptance**
- [ ] Workflow runs.

**Verification**
- View Actions.

---

### TASK-358 — CSP nonce per request

**Section:** security
**Effort:** M
**Depends on:** TASK-337
**Type:** edit

**Goal**
Inline scripts must carry per-request nonce matching CSP header.

**Files**
- edit: server.ts middleware to set `res.locals.cspNonce` and pass into HTML responses.
- edit: helmet config to use the nonce.

**Acceptance**
- [ ] No unsafe-inline in CSP.

**Verification**
- Inspect headers + source.

---

### TASK-359 — Subresource integrity on CDN

**Section:** security
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
External script tags include `integrity=` SRI hashes.

**Files**
- edit: HTML templates.

**Acceptance**
- [ ] All external `<script src=...>` have integrity attr.

**Verification**
- Grep templates.

---

### TASK-360 — HTTPS-only redirect middleware

**Section:** security
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
In production, redirect HTTP to HTTPS.

**Files**
- new: middleware.

**Implementation sketch**
- If `NODE_ENV==='production'` && `req.headers['x-forwarded-proto'] !== 'https'`: 301 to https URL.

**Acceptance**
- [ ] HTTP request: 301 to HTTPS.

**Verification**
- Curl.

---

### TASK-361 — SameSite=strict cookies

**Section:** security
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
All cookies (session, csrf) get `SameSite=Strict`, `Secure`, `HttpOnly`.

**Files**
- edit: cookie set callsites.

**Acceptance**
- [ ] Cookie attrs as expected.

**Verification**
- Browser inspector.

---

### TASK-362 — Session fixation defense

**Section:** security
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
Regenerate session ID on login.

**Files**
- edit: any session-bearing login route.

**Acceptance**
- [ ] Session ID changes after login.

**Verification**
- Inspect cookie before/after.

---

### TASK-363 — Password-strength meter

**Section:** security
**Effort:** S
**Depends on:** TASK-135
**Type:** new-file

**Goal**
Frontend zxcvbn meter for wallet password.

**Files**
- edit: frontend wallet password field.
- add dep: `zxcvbn`.

**Acceptance**
- [ ] Weak passwords flagged.

**Verification**
- UI test.

---

### TASK-364 — Encryption at rest for stored mnemonics

**Section:** security
**Effort:** M
**Depends on:** TASK-135
**Type:** edit

**Goal**
If mnemonics ever stored server-side, encrypt with `MASTER_KEY` env via AES-256-GCM.

**Files**
- new: `backend/src/wallet/atRestCrypto.ts`.

**Acceptance**
- [ ] DB rows have ciphertext only.

**Verification**
- Inspect raw DB.

---

### TASK-365 — KMS integration stub

**Section:** security
**Effort:** M
**Depends on:** TASK-364
**Type:** new-file

**Goal**
Stub for AWS KMS key wrapping; replace `MASTER_KEY` env with KMS-managed.

**Files**
- new: `backend/src/wallet/kms.ts`.
- add dep: `@aws-sdk/client-kms`.

**Acceptance**
- [ ] KMS-backed encrypt/decrypt round-trip.

**Verification**
- LocalStack KMS.

---

### TASK-366 — Tor / VPN flag (informational)

**Section:** security
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
Detect Tor exit node IPs, set `req.isTor = true` for downstream logging. Not blocking.

**Files**
- new: middleware that loads Tor exit list from `https://check.torproject.org/exit-addresses` daily.

**Acceptance**
- [ ] Tor IP marked in access log.

**Verification**
- Test with known exit IP.

---

### TASK-367 — ip2geo on auth log

**Section:** security
**Effort:** S
**Depends on:** TASK-345
**Type:** edit

**Goal**
Annotate auth events with country/city via MaxMind DB.

**Files**
- new: `backend/src/security/geo.ts` reading bundled MaxMind GeoLite2 DB.

**Acceptance**
- [ ] Auth events include country.

**Verification**
- Curl from known IP, check log.

---

### TASK-368 — Threat-feed integration

**Section:** security
**Effort:** M
**Depends on:** none
**Type:** new-file

**Goal**
Block known-bad IPs from public threat feeds (AbuseIPDB, Spamhaus DROP).

**Files**
- new: `backend/src/security/threatFeed.ts` — daily refresh, in-memory set.
- edit: server.ts middleware to reject blocked IPs early.

**Acceptance**
- [ ] Known-bad IP: 403.

**Verification**
- Add test IP to feed, request.

---

### TASK-369 — Cert-pinning notes for mobile

**Section:** security
**Effort:** S
**Depends on:** none
**Type:** docs

**Goal**
Document SHA-256 fingerprint(s) of our TLS cert chain so mobile clients can pin.

**Files**
- new: `docs/security/cert-pinning.md`.

**Acceptance**
- [ ] Doc lists current pin set.

**Verification**
- Compare to live cert.

---

### TASK-370 — Disclosure response template

**Section:** security
**Effort:** S
**Depends on:** none
**Type:** docs

**Goal**
Internal template for responding to security disclosures: ack within 24h, triage in 72h, fix timeline.

**Files**
- new: `docs/security/disclosure-response.md`.

**Acceptance**
- [ ] Doc covers SLA + escalation path.

**Verification**
- Manual review.

---

## Summary

35 tasks: 23 small, 11 medium, 1 large. Heavy infrastructure pieces around CI hooks, key management, and at-rest crypto.
