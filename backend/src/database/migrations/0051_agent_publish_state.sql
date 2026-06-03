-- up:
CREATE TABLE IF NOT EXISTS agent_publish_history (
  id BIGSERIAL PRIMARY KEY,
  source_branch TEXT NOT NULL,
  target_branch TEXT NOT NULL,
  source_commit_sha TEXT NOT NULL,
  published_commit_sha TEXT,
  tree_sha TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  skipped_duplicate BOOLEAN NOT NULL DEFAULT FALSE,
  published_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_publish_history_source
  ON agent_publish_history(source_branch, target_branch, source_commit_sha);

CREATE INDEX IF NOT EXISTS idx_agent_publish_history_tree
  ON agent_publish_history(source_branch, target_branch, tree_sha);

CREATE TABLE IF NOT EXISTS agent_publish_cursor (
  source_branch TEXT NOT NULL,
  target_branch TEXT NOT NULL,
  last_source_commit_sha TEXT,
  last_published_commit_sha TEXT,
  next_publish_at TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (source_branch, target_branch)
);

-- down:
DROP TABLE IF EXISTS agent_publish_cursor;
DROP INDEX IF EXISTS idx_agent_publish_history_tree;
DROP INDEX IF EXISTS idx_agent_publish_history_source;
DROP TABLE IF EXISTS agent_publish_history;
