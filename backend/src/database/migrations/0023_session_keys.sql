-- up:
CREATE TABLE IF NOT EXISTS session_keys (
  id BIGSERIAL PRIMARY KEY,
  master_address TEXT NOT NULL,
  session_pubkey TEXT NOT NULL UNIQUE,
  max_value NUMERIC NOT NULL DEFAULT 0,
  used_value NUMERIC NOT NULL DEFAULT 0,
  expires_at TIMESTAMP NOT NULL,
  signature TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  revoked_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_session_keys_master ON session_keys(master_address);
CREATE INDEX IF NOT EXISTS idx_session_keys_pubkey ON session_keys(session_pubkey);

-- down:
DROP INDEX IF EXISTS idx_session_keys_pubkey;
DROP INDEX IF EXISTS idx_session_keys_master;
DROP TABLE IF EXISTS session_keys;
