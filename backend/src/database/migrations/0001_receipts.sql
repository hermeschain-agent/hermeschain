-- up:
CREATE TABLE IF NOT EXISTS receipts (
  tx_hash TEXT PRIMARY KEY,
  tx_index INTEGER NOT NULL,
  block_hash TEXT NOT NULL,
  block_number BIGINT NOT NULL,
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  gas_used TEXT NOT NULL,
  cumulative_gas_used TEXT NOT NULL,
  status INTEGER NOT NULL,
  logs_json TEXT NOT NULL DEFAULT '[]',
  logs_bloom TEXT NOT NULL,
  state_root TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_receipts_block ON receipts(block_number);
CREATE INDEX IF NOT EXISTS idx_receipts_from ON receipts(from_address);
CREATE INDEX IF NOT EXISTS idx_receipts_to ON receipts(to_address);

-- down:
DROP INDEX IF EXISTS idx_receipts_to;
DROP INDEX IF EXISTS idx_receipts_from;
DROP INDEX IF EXISTS idx_receipts_block;
DROP TABLE IF EXISTS receipts;
