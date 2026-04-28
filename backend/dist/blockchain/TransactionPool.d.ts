import { Transaction } from './Block';
export interface ValidationResult {
    valid: boolean;
    error?: string;
}
export declare class TransactionPool {
    private pendingTransactions;
    private addedAtMs;
    private knownHashes;
    private syncPendingTransactionsFromDb;
    initialize(): Promise<void>;
    addTransaction(tx: Transaction): Promise<ValidationResult>;
    getPendingTransactions(limit?: number): Promise<Transaction[]>;
    removeTransactions(hashes: string[]): Promise<void>;
    /**
     * Re-check every pending tx against the current head and drop any that
     * no longer validate (bad nonce, insufficient balance, stale hash, bad
     * signature). Called from the reorg resolver so an orphaned block's
     * transactions don't persist in the pool in a now-invalid state.
     *
     * Returns the list of dropped hashes + reasons so the caller can log.
     */
    evictInvalid(): Promise<Array<{
        hash: string;
        reason: string;
    }>>;
    /**
     * Re-admit orphaned-block transactions to the pool so they can be mined
     * on the new canonical chain. Each tx goes through full validation
     * again; txs that no longer validate (e.g., their nonce is now behind)
     * are silently dropped. Returns the list of hashes that were re-admitted.
     */
    readmitOrphaned(orphaned: readonly Transaction[]): Promise<string[]>;
    private validateTransaction;
    private calculateTxHash;
    getPendingCount(): number;
    getPendingForAddress(address: string): Transaction[];
    clearExpired(maxAgeMs?: number): number;
    startExpirationLoop(intervalMs?: number, maxAgeMs?: number): NodeJS.Timeout;
}
//# sourceMappingURL=TransactionPool.d.ts.map