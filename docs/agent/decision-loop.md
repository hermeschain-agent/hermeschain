# Agent decision loop

For each task, the agent:
1. Reads task description + linked TASK-NNN spec from backlog
2. Loads relevant context (previous task post-mortems, architecture docs)
3. Plans tool sequence (read files, modify, build, verify)
4. Executes with retries on transient failure
5. Verifies via typecheck + tests + prettier
6. Commits with conventional-commits format
7. Auto-pushes (if AUTO_GIT_PUSH=true) or stages PR
8. Records post-mortem learning to agent_memory

Each step gates the next; verification failure triggers auto-rollback (TASK-200).
