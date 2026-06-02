# Auth flow

1. Admin mints API key via POST /auth/keys (X-Admin-Token gated)
2. Caller sends X-API-Key header on subsequent requests
3. apiKeyAuth middleware looks up key by SHA-256 hash, checks scope + expiry
4. Failures recorded in suspicious_events; >5/min trips auth_lockouts
5. Successful auth records in api_key_audit (action=used)
