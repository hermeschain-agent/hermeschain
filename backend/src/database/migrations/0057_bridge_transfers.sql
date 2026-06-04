-- up:
CREATE TABLE IF NOT EXISTS bridge_transfers (
  id BIGSERIAL PRIMARY KEY,
  source_chain TEXT NOT NULL,
  destination_chain TEXT NOT NULL,
  asset TEXT NOT NULL DEFAULT 'HERMES',
  amount TEXT NOT NULL,
  amount_base TEXT NOT NULL,
  sender TEXT NOT NULL,
  recipient TEXT NOT NULL,
  nonce BIGINT NOT NULL,
  lock_height INTEGER NOT NULL,
  lock_tx_hash TEXT NOT NULL,
  destination_tx_hash TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bridge_transfers_created
  ON bridge_transfers(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bridge_transfers_sender
  ON bridge_transfers(sender);

-- down:
DROP INDEX IF EXISTS idx_bridge_transfers_sender;
DROP INDEX IF EXISTS idx_bridge_transfers_created;
DROP TABLE IF EXISTS bridge_transfers;
