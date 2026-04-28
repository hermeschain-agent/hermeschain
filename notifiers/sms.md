# SMS notifier (Twilio)

Twilio API for high-priority alerts only (cost). Use for critical-tier events: own-wallet drained, validator slashed if you operate one.

## Env
- TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER

## Triggers
- Own-wallet outbound > threshold
- Validator slash event for your address
