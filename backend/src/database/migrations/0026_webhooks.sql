-- up:
CREATE TABLE IF NOT EXISTS webhooks (
  id BIGSERIAL PRIMARY KEY,
  url TEXT NOT NULL,
  filter_json TEXT NOT NULL DEFAULT '{}',
  secret TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_delivery_at TIMESTAMP,
  last_status INTEGER,
  failure_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_webhooks_active_creator
  ON webhooks(active, created_by) WHERE active = TRUE;

-- down:
DROP INDEX IF EXISTS idx_webhooks_active_creator;
DROP TABLE IF EXISTS webhooks;
