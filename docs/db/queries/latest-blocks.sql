-- Common query: latest-blocks
SELECT height, hash, producer, timestamp, gas_used FROM blocks ORDER BY height DESC LIMIT 100;
