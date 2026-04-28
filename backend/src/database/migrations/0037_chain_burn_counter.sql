-- up:
CREATE TABLE IF NOT EXISTS chain_metrics (
  metric_key TEXT PRIMARY KEY,
  metric_value NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO chain_metrics (metric_key, metric_value)
  VALUES ('total_burned', 0)
  ON CONFLICT (metric_key) DO NOTHING;
INSERT INTO chain_metrics (metric_key, metric_value)
  VALUES ('total_fees_paid', 0)
  ON CONFLICT (metric_key) DO NOTHING;

-- down:
DROP TABLE IF EXISTS chain_metrics;
