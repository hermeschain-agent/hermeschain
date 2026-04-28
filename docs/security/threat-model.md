# Threat Model

STRIDE-style threat model for Hermeschain v0.3.

## Trust boundaries

```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Browser    │ HTTPS│  Web replica │  TCP │   Postgres   │
│   (HUD)      │─────▶│  (Express)   │─────▶│   (Railway)  │
└──────────────┘      └──────────────┘      └──────────────┘
                            │ pub/sub
                            ▼
                      ┌──────────────┐      ┌──────────────┐
                      │    Redis     │◀─────│Worker replica│
                      │   (Railway)  │      │  (AgentWorker)│
                      └──────────────┘      └──────────────┘
                                                   │ HTTPS
                                                   ▼
                                            ┌──────────────┐
                                            │  Anthropic   │
                                            │   API        │
                                            └──────────────┘
```

## STRIDE per asset

### Wallet keys (browser-side)

- **Spoofing**: someone else submits txs on behalf of user
  → mitigated by ed25519 sig verify on `/wallet/send`
- **Tampering**: storage manipulation
  → mitigated by browser origin isolation; future: hardware-key (TASK-129)
- **Information disclosure**: mnemonic leak
  → mitigated by export rate-limit (TASK-351), obscured display (TASK-352), PBKDF2 export (TASK-135), KMS at rest (TASK-365)

### Validator key (server-side)

- **Spoofing/tampering**: forged blocks
  → mitigated by sig verify in `Block.fromJSON`, equivocation slashing (TASK-012)
- **Information disclosure**: env exposure
  → mitigated by log redaction (TASK-353), secrets scan in CI (TASK-354)

### Chain state

- **Tampering**: state corruption from buggy commit
  → mitigated by state-root verification on every block (TASK-045) + integrity verifier CLI (TASK-044)
- **Repudiation**: validator denies producing a block
  → mitigated by deterministic block hashes; slashing record on equivocation

### API surface

- **Denial of service**: flood `/wallet/send`
  → mitigated by IP rate limit + account gas budget cap (TASK-134)
- **Elevation of privilege**: unprivileged caller mints API keys
  → mitigated by admin-token gate (Tier-1 fix)

### Agent autonomy

- **Tampering**: agent commits malicious code
  → mitigated by branch-per-task (TASK-205), PR-mode option (TASK-201), human review on tier-3 changes
- **Information disclosure**: agent leaks secrets in commit messages
  → mitigated by secrets-scan in CI (TASK-354), log redaction (TASK-353)

## Out of scope

- Anthropic API security — assumed trusted upstream
- Railway infra security — assumed trusted upstream
- Browser-level XSS via 3rd-party extensions — beyond our control

## Update cadence

Re-review per release tier. Next review at v0.4 or after any tier-1 incident.
