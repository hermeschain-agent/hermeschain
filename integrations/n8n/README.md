# n8n custom node

Self-hostable HTTP node wrapping HermesClient methods.

Install: `npm i n8n-nodes-hermeschain`

Triggers: block-produced, tx-mined, log-emitted (with topic filter).
Actions: submit-tx, get-balance, get-receipt, query-mempool.

Lands as TASK-456 stub. Full node implementation requires SDK Python or direct REST calls.
