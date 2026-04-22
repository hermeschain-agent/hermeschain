# Release Notes — v0.5.0 "Foundation"

**Task:** phase-08 / release-notes / step-1 (docs)

The v0.5 cycle closed out Phase 1 (execution scaffolding and chain truth) and most of Phase 2 (transaction model), plus an early land on the foundation for state, consensus, VM, RPC, observability, and security.

## Highlights

### Typed core records
- `ChainMetadata`, `GenesisConfig`, `ChainIdentity`, `TransactionV1`, `TxSignature`, `TransactionReceipt`, `Account`, `Validator`, `GossipPeer`, `SlashingEvidence`, `VerificationResult`, `OperatorHealth`, `MempoolPolicy`, `FaucetPolicy`, `MerklePatricia` node types, `FinalityTracker`, `TokenBudget`.

All are `Object.freeze`d and go through a `make*` constructor that validates contracts (semver versions, BigInt-string amounts, required fields, cross-field invariants). No free-form stringly-typed records remain in the runtime path of newly-built features.

### Replay + mempool hardening
- Per-account `NonceWindow` with bounded future-nonce slots.
- `SeenTxSet` LRU keyed by `chainIdHash + txHash` for reorg-aware replay defense.
- `MempoolPolicy` with capacity, per-sender cap, TTL, and drop-lowest-fee eviction.

### Consensus + finality
- Depth-based `FinalityTracker` (32 block default).
- Fork-choice rule (GHOST-style heaviest-subtree) documented.
- Slashing conditions for equivocation + liveness drafted.

### VM
- `GasMeter` + `GasSchedule` with EVM-aligned costs and OutOfGas semantics.

### API + RPC
- Wallet RPC surface inventory.
- `TokenBucketLimiter` for per-IP gating.
- WebSocket subscription channels planned (chain.head, mempool.pending, account.<addr>, tx.<hash>).
- Faucet dual-window policy (per-address + per-IP).

### Observability
- Prometheus-compatible metrics registry (Counter + Histogram).
- Structured JSON logger.
- Agent token-budget now reports on `/api/agent/status`.

### Security
- Low-s signature canonicalization (blocks ed25519 malleability).
- Chain-id domain binding in sig + block hashing.
- Cross-cutting security review checklist.

## Breaking changes

- Block header gains `receiptsRoot`. Pre-migration blocks use a retro-synthesized value under `block.extra`.
- Transaction hash input changes (canonicalEncode + domain prefix). Legacy-accept window for one commit cycle.
- Signature shape changes from raw hex to `{scheme, publicKey, signature}`. Legacy shim during transition.

## Deferred to v0.6

- MPT algorithm implementation (types landed this cycle, insert/lookup/prove ships next).
- BFT checkpoint signatures.
- Replace-by-fee policy.
- Event log indexing.
- Contract VM reentrancy guards.
- Dependency pinning automation.

## Credits

All commits in this cycle landed through the autonomous Hermes worker against the 648-task backlog. Per-task artifacts are under `backend/src/hermes-generated/`.
