# Zapier connector spec

Trigger app for Zapier connecting to Hermeschain webhooks (TASK-454).

## Triggers
- New block produced
- New tx for watched address
- Validator slashed
- Reorg detected

## Actions
- Send tx (with signed payload)
- Subscribe to address (creates webhook)

Submit to Zapier via developer.zapier.com after webhook endpoint ships.
