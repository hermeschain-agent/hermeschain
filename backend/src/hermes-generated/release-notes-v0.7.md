# Release Notes — v0.7.0 "Ecosystem"

**Task:** phase-11 / release-notes / step-1 (docs)

The v0.7 cycle focused on the ecosystem layer around the chain — tokens, oracles, bridges, wallets, mobile, developer tooling. Protocol changes were intentionally conservative; most of the delta is new surfaces that sit alongside existing ones rather than replacing them.

## Highlights

### Ecosystem standards

- **HRM-20** fungible token standard (ERC-20 compatible at method signatures).
- **HRM-721** NFT standard (ERC-721 compatible).
- **EIP-712** typed data signing with chain-id binding.
- **Account abstraction** UserOperation + bundler mempool design.

### External connectivity

- **Price oracle** design with M-of-N signed feeds and median aggregation.
- **Cross-chain bridge** audit + lock-event record (ETH lock-and-mint, 5-of-9 relayer, 24h delay).
- **Mobile wallet pairing** via WalletConnect-like session.
- **Webhooks** with HMAC-signed delivery + exponential backoff retry.

### Scaling work

- **zk-proof integration** audit (Groth16, BN254, Poseidon).
- **Binary wire format** encoder (4× smaller than JSON).
- **WebSocket P2P mesh** audit + handshake verifier + frame codec.

### Developer ergonomics

- **TypeScript SDK shape** and **light client protocol**.
- **HD wallet derivation** (BIP-32 ed25519).
- **CLI shell completions** plan.
- **Block explorer UI** page inventory + **ABI decoder**.

### Ops + observability

- **Prometheus /metrics** endpoint with 20+ standard metrics.
- **Grafana dashboard queries** + alert thresholds.
- **Chained AuditLogger** for tamper-detection.
- **Trace context** via AsyncLocalStorage for log correlation.
- **BoundedEventQueue** for SSE/WS backpressure.
- **Redis cache helper** with stampede lock.
- **Disaster recovery plan** (5 scenarios with RTO/RPO).
- **Secret rotation** + **security disclosure** policies.

### Governance + economics

- **Typed GovernanceProposal** + stake-weighted voting with 30% quorum.
- **Treasury payout rules** (10%/proposal + 25%/month cap, 48h execution delay).
- **Delegation record** + commission-first reward math.

### CI + release

- **CI workflow matrix** (lint / build / test / fuzz / e2e / bench).
- **Release workflow** with conventional-commit changelog generator.
- **Fast-check fuzzer plan** (500 runs/PR, 50k nightly).

## Breaking changes

None at consensus level. SDK breaking changes documented per-package.

## Deferred to v0.8

- MPT algorithm implementation module (types + proof-verifier shipped, algo still sketch).
- BFT checkpoint-signature flow end-to-end.
- Replace-by-fee pool wiring.
- Bundler mempool implementation.
- Shielded-pool circuit (zk private txs).
- Multi-tenant RPC implementation (design shipped, code follows).

## Credits

All commits this cycle landed through the autonomous Hermes worker loop. Per-task artifacts under `backend/src/hermes-generated/`.
