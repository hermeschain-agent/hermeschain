# EventBus reference

Single in-process EventBus singleton (`backend/src/events/EventBus.ts`). Bridged across replicas via Redis pub/sub (TASK-330).

## Bridged events
- block_produced
- consensus_quorum
- consensus_failed
- chain_reorg
- mesh_block_received
- ci_results
- ci_failure
- ci_watch_triggered
- network_message
- state_root_mismatch

## Local-only events
- transaction_added
- transaction_removed
- task_start, task_complete (agent)
- tool_use_start, tool_use_complete
- verification_pass, verification_fail
