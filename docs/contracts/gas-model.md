# Contract gas model

Per-op cost (see backend/src/vm/GasMeter.ts). Charging:
1. Gas charged BEFORE the op executes
2. If insufficient, status='revert' with 'out-of-gas' error
3. Cumulative gasUsed = sum of charged + refunds
4. refunds capped at 1/2 of total used

## Out-of-gas tx semantics
- status = TransactionStatus.OUT_OF_GAS (2)
- Sender debited gasLimit × gasPrice (no refund)
- State changes from this tx reverted
- Logs from this tx discarded
