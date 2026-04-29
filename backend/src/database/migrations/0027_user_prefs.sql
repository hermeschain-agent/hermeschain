-- up:
CREATE TABLE IF NOT EXISTS user_prefs (
  api_key_hash TEXT PRIMARY KEY,
  prefs_json TEXT NOT NULL DEFAULT '{}',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- down:
DROP TABLE IF EXISTS user_prefs;
