-- up:
CREATE TABLE IF NOT EXISTS block_beacons (
  block_height BIGINT PRIMARY KEY,
  beacon TEXT NOT NULL,
  producer_signature TEXT NOT NULL,
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- down:
DROP TABLE IF EXISTS block_beacons;
