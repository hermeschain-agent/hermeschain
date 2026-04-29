-- up:
CREATE TABLE IF NOT EXISTS task_rejections (
  id BIGSERIAL PRIMARY KEY,
  task_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  rejected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_task_rejections_task
  ON task_rejections(task_id);

-- down:
DROP INDEX IF EXISTS idx_task_rejections_task;
DROP TABLE IF EXISTS task_rejections;
