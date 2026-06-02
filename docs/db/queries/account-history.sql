-- Common query: account-history
SELECT type, from_address, to_address, value, occurred_at FROM state_changes WHERE from_address = $1 OR to_address = $1 ORDER BY occurred_at DESC LIMIT 50;
