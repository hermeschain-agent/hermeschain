# Migration Guide: v0.5 → v0.6

**Task:** phase-10 / migration / step-1 (docs)
**Scope:** operators + integrators

## Breaking changes

### 1. Transaction schema change

v0.6 introduces `TransactionV1` with explicit `version: 1`, `chainId`, BigInt-string amounts, and the new `TxSignature` shape. Legacy txs accepted for **one commit window** post-fork-height, then rejected.

**Action for SDK users**: upgrade `@hermeschain/sdk` to v0.6.x. The legacy shim is client-side; after the window, sending old-schema txs returns HTTP 400.

### 2. Block header adds `receiptsRoot`

Pre-migration blocks synthesize a retro-receipt root into `block.extra.receiptsRoot`. Wallet code reading receipts from blocks earlier than `FORK_HEIGHT` must accept "no receipt" for those blocks.

**Action for explorers / wallets**: treat `blockHeight < FORK_HEIGHT` as `status: 'pre-receipts'`. Show tx success/fail as unknown for those blocks.

### 3. Signing domain binds chainId

Signatures produced with the pre-fork domain (`HERMES_TX_V1`) no longer verify under the post-fork domain (`HERMES_TX_V1::hermeschain-testnet`). Any offline-prepared txs signed before the fork are invalid.

**Action for operators**: if you maintained a stash of pre-signed txs, re-sign them against the new domain.

### 4. API field renames (non-breaking via aliasing)

`/api/agent/status` now returns `chainMetadata: { height, latestHash, ... }`. Flat fields like `blockHeight` are aliased for one release, then dropped in v0.7.

**Action**: migrate consumers to the nested `chainMetadata` path ahead of v0.7.

## New capabilities in v0.6

- Depth-based finality — wallets can distinguish pending / included / finalized.
- Gas metering in the VM — contracts can't loop forever.
- EIP-1559 two-axis fee market.
- Structured receipts.
- Per-IP RPC rate limits.
- WebSocket subscription channels.
- Token-budget caps on the autonomous agent.

## Upgrade path

1. Read the release notes: `release-notes-v0.5.md`.
2. Pause writes to the chain (optional; can be done in place).
3. Deploy v0.6 binary to all validators + agent worker at a coordinated `FORK_HEIGHT`.
4. Nodes past `FORK_HEIGHT` use new semantics; nodes before it still work with legacy-accept windows.
5. After one commit window, all nodes enforce new-only.

## Rollback

If v0.6 surfaces a critical bug, rollback is clean: the legacy-accept windows on v0.5 nodes still work. Re-deploy v0.5 to all services; chain continues from the last pre-fork state.
