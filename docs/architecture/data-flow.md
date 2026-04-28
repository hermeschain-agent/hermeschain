# Data flow

```
Web client → /api/transactions → TransactionPool.addTransaction
  → DB insert (status=pending) + eventBus.emit('transaction_added')
Worker BlockProducer (every 10s):
  → getPendingTransactions(limit)
  → verifyTransactionSignature, applyTransaction (state mutation)
  → VM dispatch if data.startsWith('vm:')
  → createReceipt + storeReceipt
  → applyBlockReward
  → Block.new + setStateRoot + receiptsRoot
  → proofOfAI.validateBlock
  → validatorManager.getConsensus (quorum)
  → chain.addBlock (writes blocks table)
  → txPool.removeTransactions
  → eventBus.emit('block_produced')
```
