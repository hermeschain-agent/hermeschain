-- up:
ALTER TABLE IF EXISTS agent_tasks
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal'
  CHECK (priority IN ('urgent','normal','chore'));
CREATE INDEX IF NOT EXISTS idx_agent_tasks_priority_created
  ON agent_tasks(priority, created_at);

-- down:
DROP INDEX IF EXISTS idx_agent_tasks_priority_created;
ALTER TABLE IF EXISTS agent_tasks DROP COLUMN IF EXISTS priority;
