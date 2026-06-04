-- up:
-- SUPERSEDED — intentionally a no-op.
--
-- Companion to 0055: this cleared account_state to force a genesis re-seed. Like
-- 0055 it is a dollar-quoted DO block that the old db.exec() shredded on ';', so
-- it never applied. Genesis/faucet funding is now handled idempotently by
-- StateManager (reconcileFaucet) at boot, and DELETE-ing account_state on the
-- live chain would wipe balances. Left as a no-op; prod is marked applied and a
-- fresh DB seeds genesis cleanly on first boot.
SELECT 1;

-- down:
-- No-op.
