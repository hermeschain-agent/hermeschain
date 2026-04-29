-- up:
CREATE INDEX IF NOT EXISTS idx_receipts_logs_topic0
  ON receipts USING GIN ((logs_jsonb -> 'topics' -> 0));

-- down:
DROP INDEX IF EXISTS idx_receipts_logs_topic0;
