# Tutorial: Setting up a multi-sig

1. Deploy multisig contract: `hermes deploy examples/multisig/program.json`
2. Get back the contract address
3. Configure owner set: `hermes call <addr> setOwners [pk1, pk2, pk3]`
4. Set threshold: `hermes call <addr> setThreshold 2`
5. Propose a tx: `hermes call <addr> propose <target> <value>`
6. Each owner confirms: `hermes call <addr> confirm <proposalId>`
7. Once threshold met, anyone executes: `hermes call <addr> execute <proposalId>`

Requires CALL/RETURN opcode landing (TASK-070, 071) for full functionality.
