# Block Explorer UI Inventory

**Task:** phase-09 / explorer-ui / step-1 (design)
**Scope:** `frontend/src/explorer/` (new directory)

## Pages

1. **Home** (`/explorer`)
   - Chain stats card: height, finalized height, TPS, current baseFee
   - Latest 10 blocks
   - Latest 10 txs
   - Search bar that routes by input shape: hex → tx/block/account, number → block by height

2. **Block detail** (`/explorer/block/:hashOrHeight`)
   - Header fields + timestamp relative
   - Proposer + checkpoint attestation count
   - Tx list (paginated via the cursor contract)
   - Receipts tab summary: total gas used, logs count

3. **Transaction detail** (`/explorer/tx/:hash`)
   - Status badge (pending / included / finalized / failed)
   - Fee breakdown: baseFee burned + priorityFee to producer
   - Input data decoded if ABI known, raw hex otherwise
   - Logs list with topic filter
   - Internal calls tree (from trace; later work)

4. **Account detail** (`/explorer/account/:addr`)
   - Balance, nonce, isContract
   - Tx history (paginated)
   - If contract: code hash, storage slot count
   - If validator: stake, commission, current status

5. **Validator set** (`/explorer/validators`)
   - Ranked list by stake
   - Online/offline pill
   - Uptime % over last N epochs

## Shared components

- `BlockHeightPill` — clickable jump to block detail.
- `HashLink` — copies to clipboard on click; navigates to detail on ctrl-click.
- `AmountDisplay` — formats BigInt-strings as "1,234.56 HRM".
- `TimeAgo` — "2m ago" relative, tooltip shows absolute UTC.
- `StatusPill` — reuses the terminal's green/amber/red shape.

## Data fetching

All reads go through a React `useQuery` wrapper around the SDK. Cache keys are `(route, params)`. Refetch on block height change (via WebSocket subscription).

## Non-goals for v1

- No chart / timeline graphs — text-first.
- No token-balance sub-views — only native HRM; token work ships later.
- No account-graph visualization — search + lists are enough for the first cut.
