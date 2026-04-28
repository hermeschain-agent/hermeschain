-- Common query: validator-stats
SELECT address, name, blocks_produced, scheduled_blocks, COALESCE(blocks_produced::float / NULLIF(scheduled_blocks, 0), 1.0) AS uptime FROM validators WHERE active ORDER BY blocks_produced DESC;
