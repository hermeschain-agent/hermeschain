# On-Chain Storage Pricing

**Task:** phase-05 / storage-pricing / step-1 (audit)

## Why pricing matters

A contract that grows storage indefinitely costs every node memory + disk forever. Without economic pressure to release unused storage, state bloats unboundedly. Storage pricing both compensates the network for the burden and incentivizes cleanup.

## Current model (from gas schedule)

- `SSTORE_SET` (writing a non-zero value to a previously-zero slot): 20,000 gas.
- `SSTORE_RESET` (writing a non-zero value to an already-non-zero slot): 5,000 gas.
- `SSTORE` to zero (zeroing out a slot): 5,000 gas + 4,800 refund (per the gas-refund audit).
- `SLOAD`: 800 gas.

EVM-aligned, well-understood. Adequate for a v1 launch.

## Beyond v1: rent

A more aggressive model: storage rent. Every slot owes a per-block fee proportional to its size. If the holding account can't pay, the slot is auto-deleted.

Pros:
- Incentivizes cleanup at every block boundary.
- Bounds total state growth.

Cons:
- Operationally complex (eviction, restoration, fee accounting).
- Breaks the "set-and-forget" assumption every existing contract makes.

## Recommendation

Stick with the current SSTORE-based model for v0.6 and v0.7. Revisit rent in v1.0 once we have data on actual state growth rate.

## Operator dashboard inputs

- Total storage slots: `state_slot_count`
- Growth rate: `state_slot_count[1d] - state_slot_count[2d ago]`
- Per-contract growth: histogram of slot count by `codeHash`

## Non-goals

- No archival-vs-pruned node distinction — all nodes hold full state.
- No state-shedding via snapshot rotation — historical state stays addressable.
