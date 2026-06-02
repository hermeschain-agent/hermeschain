# CREATE (planned)

Planned opcode covered by upcoming TASK in section 02. See `docs/backlog/queue/02-vm.md` for the spec.

## Status
Specced ✓ — implementation pending.

## Spec
Deploy contract. Pop value+bytecode+salt, compute address, INSERT into contract_code, push address.
