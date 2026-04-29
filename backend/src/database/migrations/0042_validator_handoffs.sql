-- up:
CREATE TABLE IF NOT EXISTS validator_handoffs (
  id BIGSERIAL PRIMARY KEY,
  block_height BIGINT NOT NULL,
  from_validator TEXT NOT NULL,
  to_validator TEXT NOT NULL,
  occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_validator_handoffs_height
  ON validator_handoffs(block_height);

-- down:
DROP INDEX IF EXISTS idx_validator_handoffs_height;
DROP TABLE IF EXISTS validator_handoffs;
