-- up:
CREATE INDEX IF NOT EXISTS idx_transactions_from_nonce
  ON transactions(from_address, nonce DESC);

-- down:
DROP INDEX IF EXISTS idx_transactions_from_nonce;
