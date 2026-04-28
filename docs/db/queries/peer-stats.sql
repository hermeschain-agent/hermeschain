-- Common query: peer-stats
SELECT peer_id, url, chain_height, last_seen_ms FROM peers ORDER BY last_seen_ms DESC;
