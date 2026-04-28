-- up:
CREATE TABLE IF NOT EXISTS state_root_log (
  block_height BIGINT PRIMARY KEY,
  state_root TEXT NOT NULL,
  computed_root TEXT,
  matches BOOLEAN NOT NULL DEFAULT TRUE,
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_state_root_log_mismatch
  ON state_root_log(matches, block_height) WHERE matches = FALSE;

-- down:
DROP INDEX IF EXISTS idx_state_root_log_mismatch;
DROP TABLE IF EXISTS state_root_log;
