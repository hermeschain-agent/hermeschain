-- up:
CREATE TABLE IF NOT EXISTS log_subscribers (
  id BIGSERIAL PRIMARY KEY,
  subscriber_id TEXT NOT NULL,
  filter_topic0 TEXT,
  filter_address TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_event_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_log_subscribers_active
  ON log_subscribers(active) WHERE active = TRUE;

-- down:
DROP INDEX IF EXISTS idx_log_subscribers_active;
DROP TABLE IF EXISTS log_subscribers;
