-- up:
CREATE TABLE IF NOT EXISTS peers (
  peer_id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  chain_height BIGINT NOT NULL DEFAULT 0,
  public_key TEXT NOT NULL DEFAULT '',
  last_seen_ms BIGINT NOT NULL,
  first_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_peers_last_seen
  ON peers(last_seen_ms DESC);

-- down:
DROP INDEX IF EXISTS idx_peers_last_seen;
DROP TABLE IF EXISTS peers;
