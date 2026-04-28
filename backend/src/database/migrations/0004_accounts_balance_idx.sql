-- up:
CREATE INDEX IF NOT EXISTS idx_accounts_balance_desc
  ON accounts ((balance::numeric) DESC);

-- down:
DROP INDEX IF EXISTS idx_accounts_balance_desc;
