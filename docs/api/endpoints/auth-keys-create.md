# POST /api/auth/keys

Mint a new API key (admin-gated).

## Headers
`X-Admin-Token: <admin token>` OR `X-API-Key: <key with admin scope>`

## Body
```json
{
  "label": "my key",
  "permissions": ["chain:read", "chain:write"],
  "expiresInDays": 90
}
```

## Response
```json
{ "id": "...", "key": "sk_...", "created": "<iso>" }
```

Key shown ONCE. Audit row written to api_key_audit.
