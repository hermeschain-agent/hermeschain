-- up:
CREATE TABLE IF NOT EXISTS account_gas_caps (
  address TEXT PRIMARY KEY,
  max_24h NUMERIC NOT NULL,
  used_24h NUMERIC NOT NULL DEFAULT 0,
  period_started TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- down:
DROP TABLE IF EXISTS account_gas_caps;
