# SSE channel reference

| Path | Events |
|---|---|
| /api/agent/stream | task_start, task_complete, tool_use_*, verification_*, error, status, log |
| /api/chain/logs/subscribe | log (filtered by topic0) |
| /api/mempool/subscribe | transaction_added, transaction_removed |
| /api/forks/subscribe | chain_reorg, mesh_block_received |
| /api/agent/tokens/stream | usage (per LLM call) |
| /api/network/stream | network_message (forum) |

All channels honor X-SSE-Failover when SSE_REPLICA pinning rejects.
