# Contract storage model

Persistent K/V storage per-contract via contract_storage table.

- SLOAD: O(log n) lookup via composite PK
- SSTORE: ON CONFLICT DO UPDATE upsert
- Cold/warm pricing: per-execution warm set tracks already-touched keys
- Refund: setting non-zero → zero refunds 15000 gas (capped at 1/2 gasUsed)
- Reads/writes only commit if execution status === 'success'
