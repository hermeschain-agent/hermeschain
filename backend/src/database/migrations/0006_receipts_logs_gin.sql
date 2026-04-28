-- up:
ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS logs_jsonb JSONB
    GENERATED ALWAYS AS (logs_json::jsonb) STORED;
CREATE INDEX IF NOT EXISTS idx_receipts_logs_gin
  ON receipts USING GIN (logs_jsonb);

-- down:
DROP INDEX IF EXISTS idx_receipts_logs_gin;
ALTER TABLE receipts DROP COLUMN IF EXISTS logs_jsonb;
