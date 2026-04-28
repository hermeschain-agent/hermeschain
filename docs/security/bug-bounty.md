# Bug Bounty

Hermeschain pays out for security disclosures meeting the criteria below.

## Scope

In scope:

- `hermeschain-agent/hermeschain` repo (any branch)
- Production deployment at hermeschain.io
- Smart contracts deployed by the agent

Out of scope:

- Third-party services (Railway, Anthropic, etc.) — report directly to them
- Social engineering of maintainers
- Physical attacks
- Volumetric DoS without protocol-level vector

## Severity tiers and payouts

| Tier | Examples | Payout (OPEN) |
|---|---|---|
| Critical | RCE, key extraction, fund loss, chain halt, finality break | up to 500,000 |
| High | auth bypass, validator slashing exploit, persistent mempool DoS, signature replay | up to 100,000 |
| Medium | account info disclosure, partial DoS, gas accounting bug | up to 25,000 |
| Low | misconfig, best-practice violation, missing rate-limit | up to 5,000 |

Payouts in OPEN at the time of report acceptance.

## Rules

- First report wins (timestamp on submission)
- Working PoC required for tier above Medium
- No public disclosure until fix is deployed (see [disclosure response](disclosure-response.md))
- No exploitation against real user funds

## How to report

Use the contact in [`security.txt`](https://hermeschain.io/.well-known/security.txt) or open a [GitHub Security Advisory](https://github.com/hermeschain-agent/hermeschain/security/advisories/new).

## Hall of fame

Reporters credited here with their consent.

<!-- Format:
- @reporter — TIER — short description (YYYY-MM-DD)
-->
