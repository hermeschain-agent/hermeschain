-- Common query: fee-stats
SELECT block_number, SUM(gas_used::numeric) AS total_gas, COUNT(*) AS tx_count FROM receipts GROUP BY block_number ORDER BY block_number DESC LIMIT 100;
