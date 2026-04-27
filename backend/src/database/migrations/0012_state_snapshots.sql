-- up:
CREATE TABLE IF NOT EXISTS state_snapshots (
  height BIGINT PRIMARY KEY,
  state_root TEXT NOT NULL,
  account_count INTEGER NOT NULL,
  storage_count INTEGER NOT NULL,
  snapshot_blob BYTEA NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- down:
DROP TABLE IF EXISTS state_snapshots;
