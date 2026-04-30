# SSTORE

Persist a key/value pair to contract storage.

**Args:** `[key, value]` (both strings)
**Gas:** 20000 base. Refund 15000 when setting non-zero → zero (TASK-087, capped at 1/2 gasUsed).
