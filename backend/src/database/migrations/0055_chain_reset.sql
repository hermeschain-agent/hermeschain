-- up:
-- SUPERSEDED — intentionally a no-op.
--
-- This was a one-time reset (2026-06-03) to clear the original partial/phantom
-- chain after the BlockProducer FK-ordering bug was fixed. It never actually
-- applied: it is a `DO $$ ... $$` block, and the old db.exec() split migration
-- SQL on ';', which shredded the dollar-quoted body into invalid fragments — so
-- it failed on every boot and HALTED the runner before all later migrations.
-- (Root-caused 2026-06-04; the runner now uses db.execRaw — see 0058.)
--
-- The reset is obsolete: the chain has long since rebuilt from genesis into a
-- real, linked chain, and the faucet is reconciled by StateManager at boot.
-- Running it now would TRUNCATE a live chain, so it is left as a no-op — prod is
-- already marked applied, and a fresh DB starts clean with nothing to reset.
SELECT 1;

-- down:
-- No-op.
