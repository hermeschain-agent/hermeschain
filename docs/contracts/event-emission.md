# Event emission

LOG opcode emits an event into the receipt. Event shape:

```json
{
  "address": "<contract addr>",
  "topics": ["<topic-0>", ...],
  "data": "<bytes>",
  "logIndex": 0,
  "blockNumber": N,
  "transactionHash": "...",
  "transactionIndex": 0
}
```

Logs are indexed via GIN on receipts.logs_jsonb (TASK-310). Filterable via /api/chain/logs by address + topic-0.
