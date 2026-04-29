-- up:
ALTER TABLE IF EXISTS agent_tasks
  ADD COLUMN IF NOT EXISTS recovery_count INTEGER NOT NULL DEFAULT 0;

-- down:
ALTER TABLE IF EXISTS agent_tasks DROP COLUMN IF EXISTS recovery_count;
