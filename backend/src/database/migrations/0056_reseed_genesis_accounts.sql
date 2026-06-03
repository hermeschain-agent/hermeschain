-- up:
-- Fix for 0055: it guarded each clear with to_regclass('public.<table>'), but
-- the app's tables resolve via the connection search_path (not necessarily the
-- 'public' schema), so the guards returned NULL and the account_state DELETE
-- never ran. Stale accounts (the legacy 'HERMESCHAIN_FAUCET' label etc.) then
-- survived the reset, so StateManager found accounts > 0 and skipped genesis
-- re-seeding — leaving the REAL key-derived faucet account (Faucet.ts) unfunded.
--
-- Clear the account ledger so the next boot re-seeds genesis onto the real
-- faucet/genesis/treasury addresses. Uses UNQUALIFIED names (search_path-
-- resolved, same as StateManager) wrapped in undefined_table guards so a fresh
-- DB — where StateManager creates these tables only AFTER migrations run —
-- doesn't fail and halt boot. Blocks are intentionally left intact so the chain
-- keeps its height (the state root simply re-bases at the next block).
DO $$
BEGIN
  BEGIN TRUNCATE TABLE state_changes RESTART IDENTITY; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM account_state; EXCEPTION WHEN undefined_table THEN NULL; END;
END $$;

-- down:
-- Irreversible data reset; no rollback.
