# Security Disclosure Policy

**Task:** phase-08 / security-disclosure / step-1 (docs)
**Scope:** `SECURITY.md` (repo root)

## Scope

In-scope:
- Backend code at `backend/`.
- Frontend code at `frontend/`.
- SDK at `sdk/` (when it ships).
- Deployment configuration at `infra/`.
- Smart contracts in `backend/src/hermes-generated/` that reach mainnet.

Out-of-scope:
- Third-party dependencies (open upstream).
- Services we don't control (Anthropic, Railway, GitHub).
- Denial-of-service attacks on public RPCs (we already rate-limit).
- Social engineering against operators.

## Reporting

Email `security@hermeschain.xyz` with:
- Issue summary (1-2 sentences).
- Reproduction steps.
- Impact estimate.
- Optional: proposed fix.

**Never** open a public GitHub issue for a security bug. Use the email path.

PGP key: `0x<fingerprint>` published on https://hermeschain.xyz/pgp.

## Response SLA

| Severity | Acknowledge | Fix target |
| --- | --- | --- |
| Critical (funds at risk) | 24 hours | 7 days |
| High (auth / consensus) | 48 hours | 30 days |
| Medium (info leak) | 5 days | 60 days |
| Low (edge-case DoS) | 10 days | next release |

## Bug bounty

Rewards from the treasury, scaled to severity:

| Severity | Reward range (HRM) |
| --- | --- |
| Critical | 50,000 – 200,000 |
| High | 10,000 – 50,000 |
| Medium | 1,000 – 10,000 |
| Low | 100 – 1,000 |

Payouts go through a governance proposal (treasury spending rule) — the operator collective can't unilaterally pay.

## Disclosure timeline

- T+0: report received.
- T+1w: acknowledgment with severity assessment.
- T+30d to T+90d: fix shipped to mainnet.
- T+14d after fix: public disclosure (blog post, CVE if warranted, reporter credited unless anonymous requested).

## Safe harbor

Reporters acting in good faith — no theft, no service degradation, no data exfiltration beyond what demonstrates the bug — are not subject to legal action.
