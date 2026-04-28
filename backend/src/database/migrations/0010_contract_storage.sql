-- up:
CREATE TABLE IF NOT EXISTS contract_storage (
  contract_address TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  storage_value TEXT NOT NULL,
  updated_at_block BIGINT NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (contract_address, storage_key)
);
CREATE INDEX IF NOT EXISTS idx_contract_storage_block
  ON contract_storage(updated_at_block);

-- down:
DROP INDEX IF EXISTS idx_contract_storage_block;
DROP TABLE IF EXISTS contract_storage;
