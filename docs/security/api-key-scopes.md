# API key permission scopes (TASK-342)

| Scope | Permits |
|---|---|
| chain:read | GET /api/blocks/*, /api/tx/*, /api/account/* |
| chain:write | POST /api/transactions |
| wallet:send | POST /api/wallet/send |
| keys:create | POST /auth/keys |
| jobs:write | DLQ retry, manual task triggers |
| admin | All of the above + key revocation + threat blocklist mgmt |
