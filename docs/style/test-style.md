# Test conventions

- Unit tests next to source (`foo.ts` + `foo.test.ts`) for new code
- Integration tests in backend/tests/integration/
- Snapshot tests for API response shapes (TASK-408)
- Property tests via fast-check (TASK-406, TASK-407)
- Fuzz tests in backend/tests/fuzz/
- Use `node:test` (built-in) over external test runners
