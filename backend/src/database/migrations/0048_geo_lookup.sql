-- up:
CREATE TABLE IF NOT EXISTS auth_geo_lookups (
  ip TEXT PRIMARY KEY,
  country_code TEXT,
  country_name TEXT,
  city TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  resolved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- down:
DROP TABLE IF EXISTS auth_geo_lookups;
