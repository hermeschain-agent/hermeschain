-- up:
CREATE TABLE IF NOT EXISTS contract_metadata (
  address TEXT PRIMARY KEY,
  name TEXT,
  abi_json TEXT,
  source_url TEXT,
  source_verified BOOLEAN NOT NULL DEFAULT FALSE,
  verifier_notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_contract_metadata_verified
  ON contract_metadata(source_verified) WHERE source_verified = TRUE;

-- down:
DROP INDEX IF EXISTS idx_contract_metadata_verified;
DROP TABLE IF EXISTS contract_metadata;
