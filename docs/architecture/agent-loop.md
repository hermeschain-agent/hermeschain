# Agent worker loop

```
while running:
  task = TaskBacklog.getNextTask()  # priority queue
  if not task:
    sleep 60s
    continue
  TaskRuntime.start(task)
  AgentExecutor.run(task)            # LLM + tool calls
  if verification_pass(task):
    GitIntegration.commitAndPush(task.changes)
  else:
    auto_rollback(task)
  TaskRuntime.complete(task)
```

Each loop iteration is one task. Stuck tasks recovered by sweep (TASK-333). Failures past 3 attempts → DLQ (TASK-334).
