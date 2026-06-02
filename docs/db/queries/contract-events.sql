-- Common query: contract-events
SELECT * FROM receipts WHERE logs_jsonb @> '[{"address":$1}]' ORDER BY block_number DESC LIMIT 100;
