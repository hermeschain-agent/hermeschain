# Transaction Simulation Engine

**Task:** phase-05 / simulation / step-1 (design)
**Scope:** `backend/src/vm/`

## Why simulate

- `POST /api/tx/estimate-gas` runs a dry-execution, returns `gasUsed`.
- `POST /api/tx/simulate` runs a full trace and returns the effect (state diff, logs, revert reason) without committing.

## Architecture

Simulation reuses the production VM but runs against a *staged* state snapshot:

```ts
class SimulationContext {
  private readonly stagedState: StagedStateView;
  private readonly gasMeter: GasMeter;
  private readonly logs: EventLog[] = [];

  constructor(liveState: StateManager, budget: number) {
    this.stagedState = liveState.stageView();
    this.gasMeter = new GasMeter(budget);
  }

  execute(tx: TransactionV1): SimulationResult {
    // Same Interpreter.execute as production, but state writes go
    // to staged view; nothing leaks back to live state.
  }
}
```

Staged view = copy-on-write overlay on the real state trie. Reads fall through; writes go to the overlay. Discarded when simulation completes.

## Return shape

```ts
interface SimulationResult {
  success: boolean;
  gasUsed: string;
  revertReason?: string;
  logs: EventLog[];
  stateDiff: Array<{ address: string; slot: string; before: string; after: string }>;
  returnValue: string;
}
```

## Gas estimation

`estimate-gas` runs simulation, returns `gasUsed * 1.2` (20% buffer for dynamic conditions between simulation and real execution). Under-buffered estimates are the #1 wallet bug; prefer over-estimating.

## Eth-style `eth_call` compat

`POST /api/rpc/call` takes a `{to, data, from?}` and returns the simulated return value. Doesn't execute on-chain; reads current state (or a pinned block via `?atBlock=N`).

## Limits

- Simulation gas budget default 30M (enough for most queries).
- Max 10 parallel simulations per server to cap RAM usage.
- Simulations don't touch the mempool.

## Non-goals

- No step-by-step debugger (Remix-style) in this rev.
- No state override for hypothetical balances — comes with `eth_call`-style extensions later.
