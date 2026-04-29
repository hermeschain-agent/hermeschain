-- up:
CREATE TABLE IF NOT EXISTS dead_letter_tasks (
  id TEXT PRIMARY KEY,
  original_task_json TEXT NOT NULL,
  last_error TEXT,
  failure_count INTEGER NOT NULL,
  moved_to_dlq_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_dlq_moved_at
  ON dead_letter_tasks(moved_to_dlq_at DESC);

-- down:
DROP INDEX IF EXISTS idx_dlq_moved_at;
DROP TABLE IF EXISTS dead_letter_tasks;
