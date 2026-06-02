# Tutorial: Run your own validator (planned)

Once tier-3 multi-validator (TASK-013, TASK-014) ships you can register a second validator. Steps:

1. Generate keypair via `npm run vanity --prefix Hermes`
2. POST /api/validators with the public key + signed registration
3. Provide AGENT_ROLE=validator + your private key in env
4. Wait for the next epoch boundary; producer rotation includes your slot.
