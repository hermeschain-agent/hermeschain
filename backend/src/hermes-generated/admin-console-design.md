# Admin Console UI

**Task:** phase-09 / admin-ui / step-1 (design)
**Scope:** `frontend/src/admin/`

## Audience

Operators who need to see internals quickly — validators, treasury, deploy status, agent task backlog. Not consumers.

## Gate

Behind an `X-Admin-Token` check (token stored in Railway env as `ADMIN_TOKEN`). The frontend prompts for the token on first load; it's cached in `sessionStorage` for the tab's lifetime.

## Pages

### Dashboard (`/admin`)

- Chain head + finalized height
- Token spend snapshot (agent)
- Validator set summary
- Last 5 commits landed
- Reorg count last hour
- CI status badge

### Validators (`/admin/validators`)

- Per-validator row: address, stake, online, uptime %, last missed slot
- Actions: view slashing events, download config

### Treasury (`/admin/treasury`)

- Current balance
- Proposals in voting / queued / executed in last 30d
- Payout stream per month

### Agent tasks (`/admin/agent`)

- Running task card
- Next 10 queued tasks
- Last 10 completed with gas/duration
- Kill-switch: pause worker / set daily token cap / flip to demo

### Logs (`/admin/logs`)

- Filter by subsystem + level
- Search by traceId
- Download last N hours

## Stack

- Same React + Vite monorepo as the public site.
- Shared components: `BlockHeightPill`, `HashLink`, `AmountDisplay`, `StatusPill`.
- Auth: `ADMIN_TOKEN` header added via axios interceptor after the user-supplied token.

## Non-goals

- No role-based admin (single level only in v1).
- No mutation actions beyond pause / unpause / cap adjustment. Destructive ops route through the CLI.
- No mobile-optimized layout — operators work from a laptop.
