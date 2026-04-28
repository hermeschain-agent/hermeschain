# Rate Limits

| Endpoint | Limit | Source |
|---|---|---|
| /api/personality/* chat | 20/min/IP | TASK-144 |
| /api/wallet/send | 30/min/key | TASK-341 |
| /api/wallet/mnemonic/export | 1/min/addr | TASK-351 |
| /api/auth/keys (admin) | 10/hr/admin | TASK-341 |
| /api/transactions | 100/min/IP | TASK-341 |
| Faucet drip | 24h cooldown + 5/IP/24h | TASK-122 |
