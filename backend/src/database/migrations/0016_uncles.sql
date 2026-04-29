-- up:
CREATE TABLE IF NOT EXISTS uncles (
  block_hash TEXT PRIMARY KEY,
  parent_hash TEXT NOT NULL,
  height BIGINT NOT NULL,
  producer TEXT NOT NULL,
  included_in_block_hash TEXT,
  found_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_uncles_height ON uncles(height);
CREATE INDEX IF NOT EXISTS idx_uncles_producer ON uncles(producer);

-- down:
DROP INDEX IF EXISTS idx_uncles_producer;
DROP INDEX IF EXISTS idx_uncles_height;
DROP TABLE IF EXISTS uncles;
