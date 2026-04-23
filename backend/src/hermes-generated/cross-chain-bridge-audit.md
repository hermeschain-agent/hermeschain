# Cross-Chain Bridge Audit

**Task:** phase-11 / bridges / step-1 (audit)
**Scope:** future `backend/src/bridge/`

## Why

Hermeschain is its own chain; users who hold assets on Ethereum or Solana need a way to move value between chains. Bridge design is one of the highest-risk areas in the industry — compromised bridges have accounted for >$2B in losses. Do this carefully.

## Bridge topology choices

### 1. Lock-and-mint

- On chain A: lock asset in a bridge contract.
- Relayer observes the lock event and triggers a mint on chain B.
- Reverse path: burn on B, relayer triggers unlock on A.

### 2. Liquidity pool

- Liquidity providers stake funds on both chains.
- User swaps in → LP pool on A, out → LP pool on B.
- No mint/burn; just pool rebalancing.
- Smaller trust surface; limited by pool size.

### 3. Atomic swap (HTLCs)

- Two users directly swap via hash time-locked contracts.
- No relayer trust; peer-to-peer.
- Requires matching counterparties; illiquid in practice.

## Recommendation

Start with lock-and-mint for high-volume flows (USDC, ETH) + liquidity pool for stablecoins. Atomic swaps are a future add.

## Trust model

Lock-and-mint requires trust in the relayer set. Two mitigations:

1. **Multi-sig relayer**: M-of-N signatures required to mint. Compromising fewer than M keys doesn't move funds.
2. **Light-client verification**: The bridge contract on chain B verifies a proof that the lock event happened on chain A, rather than trusting relayers.

Light-client verification is much stronger but requires implementing a light client for the source chain on the destination chain. Heavy work; worth it long-term.

## Scope for v1

- Lock-and-mint for ETH only.
- Multi-sig relayer (5-of-9) drawn from the operator collective.
- Withdrawal delay: 24 hours between lock and mint, giving time to intervene if a relayer is compromised.
- Per-tx cap: 10 ETH initial, scaled up after 30 days of clean operation.

## Non-goals for v1

- No cross-chain calls (just asset transfers).
- No solana support (different signature scheme, more work).
- No light-client verification (too expensive for v1).
