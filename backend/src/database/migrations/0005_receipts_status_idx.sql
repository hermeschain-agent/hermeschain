-- up:
CREATE INDEX IF NOT EXISTS idx_receipts_status
  ON receipts(status, block_number DESC);

-- down:
DROP INDEX IF EXISTS idx_receipts_status;
