-- up:
CREATE TABLE IF NOT EXISTS threat_blocklist (
  ip TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  reason TEXT,
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_threat_blocklist_expires
  ON threat_blocklist(expires_at) WHERE expires_at IS NOT NULL;

-- down:
DROP INDEX IF EXISTS idx_threat_blocklist_expires;
DROP TABLE IF EXISTS threat_blocklist;
