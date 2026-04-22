# Threat Model

**Task:** phase-08 / threat-model / step-1 (security)
**Scope:** system-wide

## Actors

- **External user** — submits txs, reads state. Trusted only within the API surface contracts.
- **Validator node operator** — runs a validator; trusted with staking keys.
- **Block producer (subset of validator)** — authors blocks when selected.
- **Agent worker** — autonomous; trusted to call Anthropic and push to main.
- **Indexer / API server** — derives from chain; read-only to consensus.
- **Adversary** — external, potentially with user-level + network-level capability.

## Assets

| Asset | Owner | Impact if compromised |
| --- | --- | --- |
| Validator signing keys | Operator | Equivocation + slashable loss of stake |
| `GITHUB_TOKEN` | Agent worker | Repo tampering |
| `ANTHROPIC_API_KEY` | Agent worker | Credit drain, no consensus impact |
| User signing keys | Users (off-chain wallets) | Funds theft |
| Chain state integrity | Consensus | Reorg + wallet confusion |
| Snapshot authenticity | Operators | Bad syncs |

## STRIDE sweep

### Spoofing

- Signed transactions (ed25519, low-s canonical) — mitigated.
- Validator attestations (signed with stake key) — mitigated.
- Peer impersonation in gossip — unmitigated at Phase-6; acceptable because blocks themselves are self-authenticating.

### Tampering

- Block header hash covers full contents (canonicalEncode + domain prefix) — mitigated.
- Wire-level tampering over plain HTTP — Railway handles TLS termination.
- Repo tampering via stolen `GITHUB_TOKEN` — rotated every 90 days; monitored via `git log --since` audit.

### Repudiation

- Every state-changing op is signed; receipts record the outcome. Acceptable.

### Information disclosure

- Chain is public. No private data held on-chain.
- Operator logs may contain secrets in error stacks — structured logger must avoid dumping env.

### Denial of Service

- Per-IP rate limit on RPC — mitigated.
- Mempool per-sender cap + TTL — mitigated.
- Agent daily token cap — mitigated.
- Network-level DDoS — Railway edge absorbs; no application-level mitigation.

### Elevation of privilege

- No admin endpoints in this build. If an admin surface lands, requires `X-Admin-Token` verified against `ADMIN_TOKEN` env.

## Residual risks

- Long-range attack — mitigated by weak subjectivity + BFT checkpoints (see `long-range-attack-defense.md`).
- Mass validator offline — graceful degradation to depth-only finality.
- Agent hallucination writing unsafe commits — mitigated by `executionScopes` gating writes + verification (`npm run build`) before push.
