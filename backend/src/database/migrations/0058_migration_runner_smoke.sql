-- up:
-- Smoke test for the migration runner. Proves two things on the next boot:
--   (a) the runner now REACHES new migrations (it used to halt on 0055), and
--   (b) db.execRaw runs dollar-quoted blocks correctly — the old ';'-splitting
--       db.exec shredded `DO $$ ... $$` bodies into invalid fragments.
-- Harmless and idempotent.
DO $$
BEGIN
  CREATE TABLE IF NOT EXISTS migration_runner_smoke (
    note TEXT NOT NULL DEFAULT 'execRaw handles DO blocks',
    checked_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
END $$;

-- down:
DROP TABLE IF EXISTS migration_runner_smoke;
