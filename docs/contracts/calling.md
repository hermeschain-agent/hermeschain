# Contract calling

A tx with `tx.to` = contract address invokes the contract code (TASK-082). The tx's `data` becomes the calldata available via CALLDATA opcode (TASK-072).

Full flow:
1. BlockProducer sees tx
2. loadCode(tx.to) returns the contract program
3. Interpreter.execute(program, tx.gasLimit, ctx) runs
4. ctx.calldata = tx.data; ctx.value = tx.value; ctx.caller = tx.from
5. Result: status + gasUsed + logs + storage writes (persisted to contract_storage)
