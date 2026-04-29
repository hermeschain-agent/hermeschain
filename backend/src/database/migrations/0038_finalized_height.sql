-- up:
INSERT INTO chain_metrics (metric_key, metric_value)
  VALUES ('finalized_height', 0)
  ON CONFLICT (metric_key) DO NOTHING;

-- down:
DELETE FROM chain_metrics WHERE metric_key = 'finalized_height';
