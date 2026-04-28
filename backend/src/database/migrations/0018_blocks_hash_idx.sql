-- up:
CREATE INDEX IF NOT EXISTS idx_blocks_hash ON blocks(hash);

-- down:
DROP INDEX IF EXISTS idx_blocks_hash;
