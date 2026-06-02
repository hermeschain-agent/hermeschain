# Validator staking (planned, TASK-013/014)

Each validator has a numeric `stake` field (TASK-311 migration). Producer rotation weighted by stake (TASK-013). Quorum threshold = `ceil(totalStake × 2/3)` (TASK-014). Slashing reduces stake on equivocation (TASK-012).
