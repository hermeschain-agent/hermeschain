-- up:
CREATE TABLE IF NOT EXISTS suspicious_events (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN
    ('auth_failure','rate_limit_hit','block_request','signature_replay','nonce_anomaly')),
  ip TEXT,
  api_key_hash TEXT,
  reason TEXT NOT NULL,
  metadata_json TEXT,
  occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_suspicious_events_occurred
  ON suspicious_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_suspicious_events_type
  ON suspicious_events(event_type, occurred_at DESC);

-- down:
DROP INDEX IF EXISTS idx_suspicious_events_type;
DROP INDEX IF EXISTS idx_suspicious_events_occurred;
DROP TABLE IF EXISTS suspicious_events;
