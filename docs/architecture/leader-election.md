# Leader election (worker)

Two worker replicas race for hermes:worker:leader Redis key (SET NX PX 30000). Leader runs:
- AgentWorker (per-task LLM calls)
- PacedPusher (60/day commit drain)
- BlockProducer (10s blocks)

Follower polls every 30s for lease loss. Renewal is atomic via Lua compare-and-renew. Lease loss triggers onLose callback to stop active loops.
