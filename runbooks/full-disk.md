# Runbook: Storage at 90%+

## Symptoms
- /health/deep slow
- pg writes failing
- container fs full

## Mitigation
- Truncate state_changes older than 90 days
- Truncate dead_letter_tasks older than 30 days
- Drop old state_snapshots beyond retention
- Bump Railway plan tier
