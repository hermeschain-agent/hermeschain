# One-Shot Task Framework

**Task:** phase-08 / one-shots / step-1 (design)
**Scope:** `backend/src/ops/`

## Why separate from migrations

Schema migrations run in milliseconds and must succeed atomically on every deploy. Data backfills (re-compute all state roots, re-index every tx, snapshot all accounts) take minutes to hours, need to be restartable, and shouldn't block boot.

## Shape

```ts
interface OneShotTask {
  id: string;                      // 'backfill-state-roots-20260422'
  description: string;
  run(ctx: TaskContext): Promise<void>;
  isIdempotent: boolean;
}

interface TaskContext {
  db: DatabaseClient;
  log: StructuredLogger;
  checkpoint(key: string, value: string): Promise<void>;
  readCheckpoint(key: string): Promise<string | null>;
}
```

## Execution

- Operator runs `hermes ops run <task-id>` (CLI command from Phase-9).
- Runner verifies the task is either in `one_shot_tasks` with status `pending` or not-yet-recorded (new task).
- Acquires a pg_advisory_lock (distinct from migration lock).
- Streams progress via `log.info` and `ctx.checkpoint` for resume-ability.
- On completion, marks status `completed` with duration + operator name.

## Restartability

A long task writes checkpoints to a `one_shot_checkpoints` table. If interrupted mid-run (SIGTERM, crash), re-running resumes from the last checkpoint. Required for any task expected to take > 5 minutes.

## Idempotency

Tasks declare `isIdempotent: true` if re-running produces the same outcome. Non-idempotent tasks require `--force` to rerun after `completed`.

## Example tasks (historical)

- `backfill-state-roots-20260422` — recompute stateRoot for every block before the MPT migration.
- `retro-receipts-20260501` — synthesize receipts for pre-receipt blocks.
- `reindex-logs-20260602` — populate event_logs after the indexer ships.

Each is a single file in `backend/src/ops/one-shots/`, imported by the runner.

## Non-goals

- No scheduling / cron — one-shots are operator-initiated only.
- No auto-retry — if a task errors, the operator reviews before retrying.
