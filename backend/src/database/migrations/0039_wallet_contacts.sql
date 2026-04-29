-- up:
CREATE TABLE IF NOT EXISTS wallet_contacts (
  api_key_hash TEXT NOT NULL,
  contact_address TEXT NOT NULL,
  alias TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (api_key_hash, contact_address)
);

-- down:
DROP TABLE IF EXISTS wallet_contacts;
