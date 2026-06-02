# Token supply

| Allocation | Amount | Notes |
|---|---|---|
| Initial circulating | 100,000 HERMES | Genesis state, treasury + faucet seed |
| Total supply (genesis) | 1,000,000 HERMES | Cap controlled by genesis.json |
| Block reward | 10 HERMES/block (env-tunable, TASK-039) | ~864,000 HERMES/day at 10s blocks |
| Burn (planned, TASK-037) | 20% of fees per block | Tracked in chain_metrics.total_burned |

Inflation is producer-controlled via HERMES_BLOCK_REWARD_WEI.

## Token contract

The public `$HERMES` token trades on Solana:

```text
6FGsTPpS56qN97BVMDFLGntFidM9g3MHXqSGmyTgpump
```

- [pump.fun](https://pump.fun/coin/6FGsTPpS56qN97BVMDFLGntFidM9g3MHXqSGmyTgpump)
- [Solscan](https://solscan.io/token/6FGsTPpS56qN97BVMDFLGntFidM9g3MHXqSGmyTgpump)

Verify the contract address above against the [official socials](../community/socials.md) before trading.
