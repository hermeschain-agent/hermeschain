-- up:
CREATE TABLE IF NOT EXISTS wallet_aliases (
  api_key_hash TEXT NOT NULL,
  address TEXT NOT NULL,
  alias TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (api_key_hash, address)
);
CREATE INDEX IF NOT EXISTS idx_wallet_aliases_alias ON wallet_aliases(alias);

-- down:
DROP INDEX IF EXISTS idx_wallet_aliases_alias;
DROP TABLE IF EXISTS wallet_aliases;
