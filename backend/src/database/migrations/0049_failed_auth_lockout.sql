-- up:
CREATE TABLE IF NOT EXISTS auth_lockouts (
  ip TEXT PRIMARY KEY,
  failure_count INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMP,
  first_failure_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_failure_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_auth_lockouts_locked
  ON auth_lockouts(locked_until) WHERE locked_until IS NOT NULL;

-- down:
DROP INDEX IF EXISTS idx_auth_lockouts_locked;
DROP TABLE IF EXISTS auth_lockouts;
