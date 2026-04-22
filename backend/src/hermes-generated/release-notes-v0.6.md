# Release Notes — v0.6.0 "Consolidation"

**Task:** phase-10 / release-notes / step-1 (docs)

v0.6 closes out the deferred work from v0.5 and lands the next tier of protocol safety + developer ergonomics.

## Highlights

### Chain / state

- MPT insert/lookup/prove algorithm sketched — algorithm module lands in v0.6.1.
- State snapshot protocol for fast sync (chunked, each chunk verifiable against stateRoot).
- Per-contract `StorageTree` with staged + commit semantics.

### Consensus

- BFT checkpoint design (2/3-stake quorum, 128-block cadence).
- CheckpointAttestation record + quorum check helper.
- Long-range attack defense (weak subjectivity + key rotation).
- View change protocol for stuck-proposer fallback.

### VM

- Call frame with per-frame gas meter, memory, stack, depth cap (1024).
- Contract deployment (CREATE + CREATE2) flow + gas model.

### Fee market + economics

- EIP-1559 two-axis fee model (baseFee + priorityFee).
- Base-fee adjustment rule (BigInt-safe, ±12.5% per block).
- Block reward distribution with 2.1M-block halving + 5% treasury split.
- Inflation schedule: 21M HRM terminal supply curve.

### Network

- Three-phase sync protocol (discovery → snapshot → block replay).
- Peer discovery bootstrap with static seed + env + peer-of-peer expansion.
- Network health rollup with green/amber/red status pill.

### RPC + SDK

- TypeScript SDK shape (`@hermeschain/sdk` planned).
- Hermes CLI command inventory (`@hermeschain/cli` planned).
- Docker Compose dev environment for one-command onboarding.

### Ops + security

- Incident response playbook (6 scenarios).
- Secret rotation runbook (5 tracked secrets).
- System-wide threat model via STRIDE.
- Benchmark harness design (8 scenarios, CI regression guard).

## Breaking changes

(Deferred from v0.5 — see [migration-guide-v0.5-to-v0.6.md](migration-guide-v0.5-to-v0.6.md).)

## Deferred to v0.7

- MPT algorithm implementation module.
- Slashing tx type + evidence-pool wiring.
- Per-slot view-change timer implementation.
- Contract reentrancy guards.
- WebSocket subscription handlers.
- SDK + CLI v0.1 tags.
- Governance on-chain proposals (treasury).
- Replace-by-fee policy.
- Event log indexing.

## Credits

All commits in this cycle landed through the autonomous Hermes worker against the v0.6 slice of the backlog. Per-task artifacts under `backend/src/hermes-generated/`.
