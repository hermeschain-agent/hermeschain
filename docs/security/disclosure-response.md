# Disclosure Response

Internal SLA + escalation path for security disclosures.

## Receive

Channel: `security.txt` contact (currently GitHub Security Advisories)
or direct DM to maintainer.

**Acknowledge within 24 hours** with the report ID and an estimate of when triage will complete.

## Triage

**Within 72 hours** of acknowledgment, classify:

| Severity | Examples | Fix SLA |
|---|---|---|
| Critical | RCE, key extraction, fund loss, chain halt | 24h |
| High | auth bypass, validator slashing exploit, mempool DoS | 7d |
| Medium | info disclosure, partial DoS, log forging | 30d |
| Low | misconfig, best-practice violation | next release |

## Fix

1. Reproduce in isolation
2. File internal TASK-NNN (do not link the disclosure publicly)
3. Implement on a private branch
4. Verify with reporter (where possible)
5. Coordinate disclosure timing with reporter

## Disclose

After fix is deployed:

1. Public advisory via GitHub
2. CHANGELOG entry with CVE/GHSA number if assigned
3. Credit reporter (with consent) on the [bug bounty page](bug-bounty.md)

## Communication

- All updates posted to original disclosure thread
- If fix is delayed, notify reporter weekly until shipped
- Embargo respected until reporter approves disclosure

## Escalation

If a disclosure goes unanswered >48h, escalate to a second maintainer.
If maintainers go silent >7d, reporter may publicly disclose.
