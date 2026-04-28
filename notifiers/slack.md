# Slack notifier

Incoming webhook posts to Slack channel on watched-address activity.

## Env
- SLACK_WEBHOOK_URL

## Triggers
- Tx involving any user-watched address
- High-value tx (configurable threshold)
- Validator slashed
- Reorg >3 blocks deep
