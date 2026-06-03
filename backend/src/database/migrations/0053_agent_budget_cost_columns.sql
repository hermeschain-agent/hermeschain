-- up:
ALTER TABLE IF EXISTS agent_token_budget_state
  ADD COLUMN IF NOT EXISTS task_bucket BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hour_cost_usd NUMERIC(12, 6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS day_cost_usd NUMERIC(12, 6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cache_read_input_tokens BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cache_creation_input_tokens BIGINT NOT NULL DEFAULT 0;

-- down:
ALTER TABLE IF EXISTS agent_token_budget_state
  DROP COLUMN IF EXISTS cache_creation_input_tokens,
  DROP COLUMN IF EXISTS cache_read_input_tokens,
  DROP COLUMN IF EXISTS day_cost_usd,
  DROP COLUMN IF EXISTS hour_cost_usd,
  DROP COLUMN IF EXISTS task_bucket;
