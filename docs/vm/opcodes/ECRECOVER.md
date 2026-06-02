# ECRECOVER (planned)

Planned opcode covered by upcoming TASK in section 02. See `docs/backlog/queue/02-vm.md` for the spec.

## Status
Specced ✓ — implementation pending.

## Spec
Recover signer. Pop (msg, sig, pubkey), push pubkey if valid else 0.
