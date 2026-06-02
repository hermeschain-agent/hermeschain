-- Common query: reorg-history
SELECT depth, orphaned_count, added_count, new_height, common_ancestor_height, occurred_at FROM reorg_log ORDER BY occurred_at DESC LIMIT 50;
