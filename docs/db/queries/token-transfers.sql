-- Common query: token-transfers
SELECT * FROM receipts WHERE logs_jsonb @> '[{"topics":["Transfer"]}]' ORDER BY block_number DESC LIMIT 100;
