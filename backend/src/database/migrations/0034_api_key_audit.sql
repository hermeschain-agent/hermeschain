-- up:
CREATE TABLE IF NOT EXISTS api_key_audit (
  id BIGSERIAL PRIMARY KEY,
  key_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('created','rotated','revoked','used')),
  actor TEXT NOT NULL,
  metadata_json TEXT,
  occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_api_key_audit_key
  ON api_key_audit(key_id, occurred_at DESC);

-- down:
DROP INDEX IF EXISTS idx_api_key_audit_key;
DROP TABLE IF EXISTS api_key_audit;
