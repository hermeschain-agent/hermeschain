-- up:
CREATE TABLE IF NOT EXISTS validator_slashes (
  id BIGSERIAL PRIMARY KEY,
  validator_address TEXT NOT NULL,
  block_height BIGINT NOT NULL,
  reason TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  stake_before NUMERIC NOT NULL,
  stake_after NUMERIC NOT NULL,
  slashed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_slashes_validator
  ON validator_slashes(validator_address);
CREATE INDEX IF NOT EXISTS idx_slashes_height
  ON validator_slashes(block_height);

-- down:
DROP INDEX IF EXISTS idx_slashes_height;
DROP INDEX IF EXISTS idx_slashes_validator;
DROP TABLE IF EXISTS validator_slashes;
