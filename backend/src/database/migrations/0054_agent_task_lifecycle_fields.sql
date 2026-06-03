-- up:
ALTER TABLE IF EXISTS agent_source_tasks
  ADD COLUMN IF NOT EXISTS recovery_count INT DEFAULT 0;

ALTER TABLE IF EXISTS agent_task_runs
  ADD COLUMN IF NOT EXISTS failure_class VARCHAR(64);

CREATE TABLE IF NOT EXISTS dead_letter_tasks (
  id TEXT PRIMARY KEY,
  original_task_json TEXT NOT NULL,
  last_error TEXT,
  failure_count INTEGER NOT NULL,
  moved_to_dlq_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- down:
ALTER TABLE IF EXISTS agent_task_runs
  DROP COLUMN IF EXISTS failure_class;

ALTER TABLE IF EXISTS agent_source_tasks
  DROP COLUMN IF EXISTS recovery_count;
