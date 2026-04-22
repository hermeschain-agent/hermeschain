# Security Review Checklist

**Task:** phase-08 / security-review / step-1 (audit)
**Scope:** repo-wide

A sweep of the surfaces attackers target. Each item references the workstream that addressed it (or should).

## Cryptography

- [x] Signature malleability (low-s canonicalization) — `tx-signature-record.ts`
- [x] Chain-id binding in signing domain — `chain-identity-record.ts`
- [x] Public-key length enforcement — `tx-signature-record.ts`
- [ ] BLS / Schnorr support — deferred, scheme field in TxSignature is forward-compat
- [x] Deterministic canonical encoding — `canonical-encode.ts`

## Transaction / mempool

- [x] Replay protection via NonceWindow + SeenTxSet — `replay-protection`
- [x] Pool capacity + per-sender cap + TTL — `mempool-policy.ts`
- [x] chainId bound at admission — `transaction-v1-wiring-plan.md`
- [ ] Replace-by-fee policy — separate workstream
- [ ] Mempool DDoS from single IP — mitigated by `rate-limiter.ts` at RPC layer

## Consensus

- [x] Depth-based finality — `finality-tracker.ts`
- [x] Fork-choice rule — `fork-choice-ghost.md`
- [x] Slashing for equivocation + liveness — `slashing-conditions.md`
- [ ] Long-range attack defense — requires checkpoint signatures, separate workstream
- [ ] BFT checkpoints — separate workstream

## VM

- [x] Gas metering — `gas-schedule.ts`
- [x] Out-of-gas halt — `OutOfGasError` in same file
- [ ] Reentrancy guards — contract work, separate workstream

## API / network

- [x] Per-IP rate limits — `rate-limiter.ts`
- [ ] CORS lockdown in production — env `CORS_ORIGINS` already exists in .env.example
- [ ] TLS termination — infra concern (Railway handles)
- [ ] Request-size caps — add Express body-size limit

## Agent / operator

- [x] Token-budget ceiling — `TokenBudget.ts`
- [x] Anti-guzzler circuit breaker — existing `hermesClient.ts`
- [x] Per-event-type cooldowns — existing `TaskSources.ts`
- [ ] Signed writes from agent — worker commits today are authenticated via GITHUB_TOKEN; document rotation cadence

## Deployment

- [ ] Secret rotation runbook — todo
- [ ] Incident response playbook — todo
- [ ] Dependency pinning — package-lock.json tracked, good
- [ ] Reproducible builds — npm ci in deploy, good

Items with `[ ]` become explicit follow-up tickets in the next planning cycle.
