import { Transaction } from './Block';
export interface AccountState {
    address: string;
    balance: bigint;
    nonce: number;
    codeHash?: string;
    storageRoot?: string;
}
export interface StateChange {
    address: string;
    previousBalance: bigint;
    newBalance: bigint;
    previousNonce: number;
    newNonce: number;
    blockHeight: number;
    txHash?: string;
}
export declare class StateManager {
    private accounts;
    private stateRoot;
    private initialized;
    private stateChanges;
    initialize(): Promise<void>;
    private initializeGenesisState;
    getBalance(address: string): bigint;
    refreshAccount(address: string): Promise<void>;
    refreshAllAccounts(): Promise<void>;
    getNonce(address: string): number;
    getAccount(address: string): AccountState | undefined;
    getStateRoot(): string;
    applyTransaction(tx: Transaction, blockHeight: number): Promise<boolean>;
    /**
     * Revert every transaction in a block in LIFO order. Returns the set of
     * account addresses whose state changed so callers (reorg resolver,
     * mempool eviction) can re-check invariants.
     *
     * Mirror of applyTransaction: credit sender back value + gas, decrement
     * sender nonce by 1, debit recipient by value. Safe against already-
     * reverted blocks because it operates on the in-memory Map directly and
     * re-persists the final state.
     */
    revertBlock(block: {
        transactions: Transaction[];
        header: {
            producer: string;
            height: number;
        };
    }, blockReward?: bigint): Promise<{
        touched: string[];
    }>;
    applyBlockReward(producer: string, blockHeight: number, reward?: bigint): Promise<void>;
    processFaucetRequest(toAddress: string, amount: bigint, blockHeight: number): Promise<boolean>;
    calculateStateRoot(): string;
    private buildMerkleRoot;
    commitBlock(blockHeight: number): Promise<string>;
    getRecentStateChanges(limit?: number): StateChange[];
    getAccountsSummary(): {
        address: string;
        balance: string;
        nonce: number;
    }[];
    getTotalSupply(): bigint;
    getCirculatingSupply(): bigint;
    formatBalance(balance: bigint): string;
    private persistAccountState;
    private persistStateChange;
}
export declare const stateManager: StateManager;
//# sourceMappingURL=StateManager.d.ts.map