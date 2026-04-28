-- up:
CREATE INDEX IF NOT EXISTS idx_state_changes_address
  ON state_changes(from_address, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_state_changes_to_address
  ON state_changes(to_address, occurred_at DESC);

-- down:
DROP INDEX IF EXISTS idx_state_changes_to_address;
DROP INDEX IF EXISTS idx_state_changes_address;
