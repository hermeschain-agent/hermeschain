-- up:
CREATE TABLE IF NOT EXISTS agent_skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  rate_limit_per_min INTEGER,
  loaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_agent_skills_enabled ON agent_skills(enabled);

-- down:
DROP INDEX IF EXISTS idx_agent_skills_enabled;
DROP TABLE IF EXISTS agent_skills;
