-- up:
CREATE TABLE IF NOT EXISTS token_usage_daily (
  date DATE PRIMARY KEY,
  input_tokens BIGINT NOT NULL DEFAULT 0,
  output_tokens BIGINT NOT NULL DEFAULT 0,
  cache_read_tokens BIGINT NOT NULL DEFAULT 0,
  cost_usd NUMERIC(12, 4) NOT NULL DEFAULT 0
);

-- down:
DROP TABLE IF EXISTS token_usage_daily;
