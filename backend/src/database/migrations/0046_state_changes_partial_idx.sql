-- up:
CREATE INDEX IF NOT EXISTS idx_state_changes_address
  ON state_changes(address, created_at DESC);

-- down:
DROP INDEX IF EXISTS idx_state_changes_to_address;
DROP INDEX IF EXISTS idx_state_changes_address;
