# Price Oracle Design

**Task:** phase-11 / oracles / step-1 (design)
**Scope:** future `backend/src/oracles/`

## Why oracles

Contracts that reference external data (asset prices, weather, sports outcomes, API results) need a trusted way to land that data on-chain. Without an oracle, smart contracts can't bridge the off-chain world.

## Shape: signed price feed

```ts
interface PriceUpdate {
  feedId: string;        // 'HRM/USD', 'ETH/USD', ...
  price: string;         // BigInt-safe decimal (e.g., '12345' for $123.45)
  decimals: number;      // how many digits of price are after the decimal point
  roundId: number;       // monotonic sequence
  timestampMs: number;
  signers: string[];     // addresses that co-signed this round
  signatures: string[];  // ed25519 sigs, one per signer
}
```

## On-chain storage

```
storage slot per feedId → {price, decimals, roundId, timestampMs, lastUpdaterSet}
```

A contract reads `priceOf('HRM/USD')` via a precompile or library call. Cost: 1 SLOAD.

## Update flow

1. Operator runs the oracle node off-chain; pulls prices from a configured source (Coinbase / Binance / custom).
2. Multiple operator nodes each sign the same PriceUpdate.
3. One of them submits via `oracle_update` tx.
4. Chain verifies M-of-N signatures (threshold configurable per feed).
5. If threshold met, updates the storage slot.

## Stale-price protection

Each feed has a max staleness (configurable, default 10 min). Contracts reading a feed older than its max treat it as unavailable — avoids decisions on stale data during oracle outages.

## Attack surface

- **Sybil**: one attacker running N oracle nodes defeats M-of-N. Mitigation: operator diversity requirement enforced at signer-set registration.
- **Price manipulation**: compromised operators sign off-market prices. Mitigation: median-of-signed-prices rather than simple majority; wild outliers discarded.
- **Front-running**: a price update that moves a leveraged position can be sandwich-attacked. Mitigation: atomic update + liquidation txs in the same block via priority ordering.

## Non-goals for this rev

- No Chainlink-style decentralized oracle network — reuse is fine if a demand appears.
- No cross-chain oracle feeds.
- No non-price oracles (sports, weather) — price feeds first, generalize later.
