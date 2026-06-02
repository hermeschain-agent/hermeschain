-- Common query: slashing-events
SELECT validator_address, block_height, reason, stake_before, stake_after, slashed_at FROM validator_slashes ORDER BY slashed_at DESC LIMIT 50;
