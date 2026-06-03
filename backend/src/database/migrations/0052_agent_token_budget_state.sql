-- up:
CREATE TABLE IF NOT EXISTS agent_token_budget_state (
  budget_key TEXT PRIMARY KEY,
  hour_bucket BIGINT NOT NULL DEFAULT 0,
  day_bucket BIGINT NOT NULL DEFAULT 0,
  task_bucket BIGINT NOT NULL DEFAULT 0,
  hour_cost_usd NUMERIC(12, 6) NOT NULL DEFAULT 0,
  day_cost_usd NUMERIC(12, 6) NOT NULL DEFAULT 0,
  cache_read_input_tokens BIGINT NOT NULL DEFAULT 0,
  cache_creation_input_tokens BIGINT NOT NULL DEFAULT 0,
  hour_window_end TIMESTAMP NOT NULL,
  day_window_end TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- down:
DROP TABLE IF EXISTS agent_token_budget_state;
