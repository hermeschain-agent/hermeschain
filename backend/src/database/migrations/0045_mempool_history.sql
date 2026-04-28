-- up:
CREATE TABLE IF NOT EXISTS mempool_history (
  sample_at TIMESTAMP PRIMARY KEY,
  pending_count INTEGER NOT NULL,
  bytes_estimate BIGINT NOT NULL DEFAULT 0,
  median_gas_price NUMERIC NOT NULL DEFAULT 0
);

-- down:
DROP TABLE IF EXISTS mempool_history;
