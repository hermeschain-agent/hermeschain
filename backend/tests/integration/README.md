# Integration tests

Spin up real PG + Redis via testcontainers. Run with:

```bash
npm test -- backend/tests/integration
```

Each test file boots a fresh backend instance, exercises a slice of the API + worker pipeline end-to-end, then tears down.

## Coverage targets
- Boot + migrations apply (TASK-391)
- Block produce + receipt persist + restart query (TASK-392)
- Reorg state convergence (TASK-393)
- VM tx end-to-end (TASK-394)
- Peer announce + list (TASK-395)
- Faucet → send → balance (TASK-396)
- API-key creation gated (TASK-397)
- SSE event coverage (TASK-398)
- Socket.io rooms (TASK-399)
