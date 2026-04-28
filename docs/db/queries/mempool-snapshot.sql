-- Common query: mempool-snapshot
SELECT hash, from_address, to_address, value, gas_price, nonce FROM transactions WHERE status='pending' ORDER BY gas_price DESC LIMIT 100;
