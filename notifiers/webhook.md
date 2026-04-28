# Webhook notifier (HTTP POST)

User-registered URL receives POST on subscribed events.

## Format
```json
{
  "event_type": "tx_mined",
  "timestamp": 1714425600,
  "payload": { ... },
  "signature": "sha256-hmac of body using webhook secret"
}
```

## Verification
HMAC-SHA256(body, secret) → compare to X-Hermes-Signature header. Reject mismatches.
