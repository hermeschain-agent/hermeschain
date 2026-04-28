-- up:
CREATE TABLE IF NOT EXISTS reorg_log (
  id BIGSERIAL PRIMARY KEY,
  occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  depth INTEGER NOT NULL,
  orphaned_count INTEGER NOT NULL,
  added_count INTEGER NOT NULL,
  new_height BIGINT NOT NULL,
  common_ancestor_height BIGINT NOT NULL,
  metadata_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_reorg_log_occurred
  ON reorg_log(occurred_at DESC);

-- down:
DROP INDEX IF EXISTS idx_reorg_log_occurred;
DROP TABLE IF EXISTS reorg_log;
