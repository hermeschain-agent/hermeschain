# Token supply

| Allocation | Amount | Notes |
|---|---|---|
| Initial circulating | 100,000 OPEN | Genesis state, treasury + faucet seed |
| Total supply (genesis) | 1,000,000 OPEN | Cap controlled by genesis.json |
| Block reward | 10 OPEN/block (env-tunable, TASK-039) | ~864,000 OPEN/day at 10s blocks |
| Burn (planned, TASK-037) | 20% of fees per block | Tracked in chain_metrics.total_burned |

Inflation is producer-controlled via HERMES_BLOCK_REWARD_WEI.
