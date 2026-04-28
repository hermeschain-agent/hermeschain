# Glossary

| Term | Definition |
|---|---|
| **Agent** | The autonomous Hermes process that authors commits, reviews CI, and posts updates. Runs as the Railway worker service. |
| **Beacon** | A producer-signed value over `(parentHash, height)` per block, used as a tamper-resistant randomness source for contracts (TASK-033). |
| **Block** | An ordered batch of transactions plus a header. Produced every ~10s by the current rotating validator. |
| **Block reward** | The amount credited to the producer's address for each finalized block. Configurable via `HERMES_BLOCK_REWARD_WEI`. |
| **CIP** | Hermeschain Improvement Proposal. Validators debate + vote on changes; the agent ships approved ones. |
| **Coinbase tx** | Synthetic transaction (`coinbase:<height>`) representing the block reward + fee share for the producer. |
| **Fork choice** | The rule that picks the canonical chain when multiple competing chains exist. Hermeschain uses GHOST (heaviest subtree). |
| **Finality** | A block is finalized once it's `FORK_CHOICE_DEPTH` (12) blocks deep. Reorgs past finality are refused. |
| **Mempool** | The set of pending, signed transactions awaiting inclusion. |
| **Migration** | A versioned SQL file in `backend/src/database/migrations/NNNN_slug.sql`. Applied lexicographically at boot via `applyPendingMigrations`. |
| **OPEN** | The native token. 1 OPEN = 10^18 wei. |
| **Peer** | A remote Hermeschain node. Discovered via `/api/mesh/announce`. |
| **Producer** | The validator allowed to mint a given block. Selected by VRF-style hash on `(parentHash, height)`. |
| **Quorum** | The 2/3 stake-weighted approval threshold for finalizing a block. |
| **Reorg** | Switching the canonical chain to a different fork. Triggers state revert + mempool eviction. |
| **Slashing** | Stake penalty for proven misbehavior (currently: equivocation). |
| **State root** | Merkle root over all account balances + contract storage at a given height. |
| **Validator** | A signing identity that produces and votes on blocks. Currently single-validator (Hermes); multi-validator support shipping in tier-3. |
| **VM program** | A JSON-op array stored in `tx.data` after the `vm:` prefix. Executed by the Hermes VM (TASK-061..105). |
