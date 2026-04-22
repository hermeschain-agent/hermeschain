# Inflation Schedule

**Task:** phase-07 / inflation / step-1 (audit + design)
**Scope:** `backend/src/blockchain/`

## Supply model

Hermeschain follows a Bitcoin-style fixed-supply-asymptote with a more aggressive halving cadence to hit terminal supply faster.

- Genesis reward: 5 HRM per block
- Halving every 2,100,000 blocks (~194 days at 8s blocks)
- Asymptotic total supply: `5 * 2_100_000 * 2 = 21_000_000 HRM` (before treasury cut)

## Supply curve

| Epoch | Block range | Reward per block | Tokens minted in epoch |
| --- | --- | --- | --- |
| 0 | 0 – 2.1M | 5.0 HRM | 10.5M |
| 1 | 2.1M – 4.2M | 2.5 HRM | 5.25M |
| 2 | 4.2M – 6.3M | 1.25 HRM | 2.625M |
| 3 | 6.3M – 8.4M | 0.625 HRM | 1.3125M |
| ... | ... | ... | ... |
| ∞ | — | → 0 | → 0 |

Sum converges to 21M HRM.

## Treasury share

5% of every block reward goes to the protocol treasury address (configured in `GenesisConfig.treasuryAddress`). Used to fund audits, bounty payouts, and public-goods grants — governed by on-chain treasury proposals in a future workstream.

## Transaction fees

Base fee (EIP-1559) is burned. Priority fee (tip) goes to the producer. Burned fees reduce supply; net issuance = (block reward) − (burned base fees). Under congestion, net issuance can go negative.

## Operator-facing metrics

Expose on `/api/chain/economics`:
```json
{
  "circulatingSupply": "18500000000000000000000000",
  "totalMintedSinceGenesis": "19200000000000000000000000",
  "totalBurnedSinceGenesis": "700000000000000000000000",
  "currentEpoch": 3,
  "nextHalvingHeight": 8400000,
  "blocksUntilHalving": 45172
}
```
Pulled from `RewardPolicy.computeReward` aggregated since genesis + burn accounting from the fee-market block-level `baseFeeBurned` field (new header field, lands with the fee-market work).
