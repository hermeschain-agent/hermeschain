-- up:
CREATE TABLE IF NOT EXISTS watched_addresses (
  api_key_hash TEXT NOT NULL,
  address TEXT NOT NULL,
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (api_key_hash, address)
);
CREATE INDEX IF NOT EXISTS idx_watched_address
  ON watched_addresses(address);

-- down:
DROP INDEX IF EXISTS idx_watched_address;
DROP TABLE IF EXISTS watched_addresses;
