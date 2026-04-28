-- up:
CREATE TABLE IF NOT EXISTS contract_code (
  address TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  bytecode TEXT NOT NULL,
  deployed_at_block BIGINT NOT NULL,
  deployed_by TEXT NOT NULL,
  deployed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_contract_code_hash
  ON contract_code(code_hash);
CREATE INDEX IF NOT EXISTS idx_contract_code_deployer
  ON contract_code(deployed_by);

-- down:
DROP INDEX IF EXISTS idx_contract_code_deployer;
DROP INDEX IF EXISTS idx_contract_code_hash;
DROP TABLE IF EXISTS contract_code;
