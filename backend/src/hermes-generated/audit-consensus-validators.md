# Audit: Consensus Validator Set

**Task:** phase-06 / consensus-validators / step-1 (audit)
**Scope:** `backend/src/validators/`

## Validator role today

- `ValidatorManager` keeps a flat list from env on boot.
- `BlockProducer` picks the next proposer via round-robin.
- No weighted selection, no liveness probe, no join/leave, no slashing.

## What consensus safety needs

| Concern | Current | Target |
| --- | --- | --- |
| Weighted proposer selection | round-robin | stake-weighted random |
| Liveness probe | none | per-validator heartbeat + `online` flag |
| Join / leave | validator set frozen | validator-set diff tx type |
| Equivocation detection | none | observe double-signed blocks, flag |
| Slashing | none | slash equivocating / offline stake |
| Checkpoint signatures | none | 2/3 signature aggregation |

Most of these are separate workstreams. This audit scopes only the canonical validator record + selection.

## Step-2 contract

```ts
interface Validator {
  address: string;
  publicKey: string;
  stake: string;       // BigInt-safe
  joined: number;      // block height
  online: boolean;
  lastSeenMs: number | null;
}

function selectProposer(set: Validator[], blockHash: string): Validator {
  // Stake-weighted pseudo-random: hash blockHash as entropy, scale onto
  // cumulative stake, pick the matching validator.
}
```

Selection is deterministic given the previous block's hash — all honest validators agree on who proposes next without any network round-trip.
