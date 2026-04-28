# Transaction fees

Currently fixed: each tx pays `gasUsed × gasPrice`. With TASK-037:
- 80% credited to producer (paid as part of block reward distribution)
- 20% burned (subtracted from circulating supply)
- Burn counter exposed at /api/chain/burn
