-- Common query: tx-history
SELECT * FROM transactions WHERE from_address = $1 OR to_address = $1 ORDER BY block_height DESC, nonce DESC LIMIT 50;
