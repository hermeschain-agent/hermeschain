-- up:
CREATE TABLE IF NOT EXISTS names (
  name TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  owner TEXT NOT NULL,
  registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_names_address ON names(address);
CREATE INDEX IF NOT EXISTS idx_names_owner ON names(owner);

-- down:
DROP INDEX IF EXISTS idx_names_owner;
DROP INDEX IF EXISTS idx_names_address;
DROP TABLE IF EXISTS names;
