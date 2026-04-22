# Seed Faucet Operational Rules

**Task:** phase-07 / faucet-ops / step-1 (docs)

## Why

Without a topped-up faucet, new users can't get test funds, can't send their first tx, can't onboard. Faucet uptime is a developer-experience metric.

## Owner + funding

- Owned by the operator collective.
- Initial allocation: 1M HRM transferred from treasury at chain genesis.
- Refill on `<200 HRM` balance via a treasury-funded auto-top-up tx.

## Refill cadence + size

- Auto-top-up triggers when balance dips below 200 HRM.
- Refill amount: bring back to 1000 HRM.
- Capped at 10M HRM per month from treasury (a stuck refill loop won't drain).

## Distribution policy

Per `faucet-policy.ts`:
- 1 HRM per drop.
- 1 drop per address per 24h.
- 3 drops per IP per 24h.
- Recipients with > 10 HRM existing balance are rejected (faucet is for first-time users, not refills).

## Abuse handling

If a single IP / address pattern starts gaming the rules:
- Add to a denylist (operator-only `hermes admin faucet deny <pattern>`).
- Denylisted entries return HTTP 403 with `{error: 'denied', code: 'FAUCET_DENIED'}`.
- Periodic review removes stale denylist entries (90-day TTL).

## Metrics

- `hermes_faucet_drops_total` counter
- `hermes_faucet_balance_remaining` gauge (alert if `< 50`)
- `hermes_faucet_refills_total` counter
- `hermes_faucet_denied_total{reason}` counter

## Non-goals

- No CAPTCHA — adds friction for legitimate users; rate-limit is the primary defense.
- No social-login required — same reason.
- No mainnet faucet — only testnet. Mainnet HRM has actual economic value.
