-- up:
-- One-time credible-chain reset (2026-06-03).
--
-- Background: BlockProducer used to insert consensus_events BEFORE the block
-- row, so every non-genesis block violated consensus_events_block_height_fkey
-- and was silently dropped — only genesis ever persisted, while the public
-- height read a wall-clock-synthetic ~436k. With the producer fixed to persist
-- the block first (and report the real height), clear the partial/phantom chain
-- state so a clean, linked chain rebuilds from genesis.
--
-- The genesis DATE is KEPT: chain_state.genesis_time is left untouched here and
-- re-pinned on boot by Chain.initialize(); genesis + the funded genesis accounts
-- are re-seeded automatically (Chain/StateManager on first boot after this).
--
-- Defensive: each table is guarded with to_regclass because this migration runs
-- (server.ts: applyPendingMigrations) BEFORE StateManager.initialize() creates
-- account_state/state_changes. On a fresh DB those tables don't exist yet, and
-- an unguarded DELETE would throw and halt boot. Order respects the only two FKs
-- to blocks(height) — transactions and consensus_events — clearing them first.
DO $$
BEGIN
  IF to_regclass('public.consensus_events') IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE consensus_events RESTART IDENTITY';
  END IF;
  IF to_regclass('public.transactions') IS NOT NULL THEN
    EXECUTE 'DELETE FROM transactions';
  END IF;
  IF to_regclass('public.blocks') IS NOT NULL THEN
    EXECUTE 'DELETE FROM blocks';
  END IF;
  IF to_regclass('public.state_changes') IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE state_changes RESTART IDENTITY';
  END IF;
  IF to_regclass('public.account_state') IS NOT NULL THEN
    EXECUTE 'DELETE FROM account_state';
  END IF;
END $$;

-- down:
-- Irreversible data reset; no rollback.
