-- up:
ALTER TABLE IF EXISTS validators
  ADD COLUMN IF NOT EXISTS scheduled_blocks BIGINT NOT NULL DEFAULT 0;
ALTER TABLE IF EXISTS validators
  ADD COLUMN IF NOT EXISTS last_seen_height BIGINT;

-- down:
ALTER TABLE IF EXISTS validators DROP COLUMN IF EXISTS last_seen_height;
ALTER TABLE IF EXISTS validators DROP COLUMN IF EXISTS scheduled_blocks;
