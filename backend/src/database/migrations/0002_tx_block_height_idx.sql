-- up:
CREATE INDEX IF NOT EXISTS idx_transactions_block_height
  ON transactions(block_height);

-- down:
DROP INDEX IF EXISTS idx_transactions_block_height;
