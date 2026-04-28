-- up:
CREATE TABLE IF NOT EXISTS scheduled_txs (
  hash TEXT PRIMARY KEY,
  target_height BIGINT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','submitted','expired','cancelled')),
  scheduled_by TEXT NOT NULL,
  scheduled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  submitted_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_scheduled_txs_status_height
  ON scheduled_txs(status, target_height);

-- down:
DROP INDEX IF EXISTS idx_scheduled_txs_status_height;
DROP TABLE IF EXISTS scheduled_txs;
