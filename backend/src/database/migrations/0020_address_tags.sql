-- up:
CREATE TABLE IF NOT EXISTS address_tags (
  address TEXT NOT NULL,
  tag TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (address, tag)
);
CREATE INDEX IF NOT EXISTS idx_address_tags_tag ON address_tags(tag);

-- down:
DROP INDEX IF EXISTS idx_address_tags_tag;
DROP TABLE IF EXISTS address_tags;
