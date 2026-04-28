-- up:
CREATE TABLE IF NOT EXISTS agent_task_deps (
  task_id TEXT NOT NULL,
  depends_on TEXT NOT NULL,
  PRIMARY KEY (task_id, depends_on)
);
CREATE INDEX IF NOT EXISTS idx_agent_task_deps_dep
  ON agent_task_deps(depends_on);

-- down:
DROP INDEX IF EXISTS idx_agent_task_deps_dep;
DROP TABLE IF EXISTS agent_task_deps;
