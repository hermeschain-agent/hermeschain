"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Chain = void 0;
const Block_1 = require("./Block");
const db_1 = require("../database/db");
const EventBus_1 = require("../events/EventBus");
// Genesis parent hash in base58 format
const GENESIS_PARENT_HASH = 'OPENChainGenesisBlock00000000000000000000000';
// Fork resolution configuration
const MAX_REORG_DEPTH = 100;
const DEFAULT_BLOCK_INTERVAL_MS = 10000;
// Canonical Hermeschain genesis: 2026-04-14 03:00:00 UTC.
// Uptime and chain-age counters key off this. Never changes — changing it
// would rewrite every block's timestamp relative to genesis, which breaks
// any historical query that assumes a stable genesis anchor.
const HERMESCHAIN_GENESIS_MS = Date.UTC(2026, 3, 14, 3, 0, 0);
class Chain {
    constructor() {
        this.blocks = [];
        this.difficulty = 1;
        this.genesisTime = HERMESCHAIN_GENESIS_MS;
        this.totalTransactions = 0;
        this.orphanedBlocks = []; // Blocks waiting for parent
    }
    async loadPersistedBlocks() {
        const [blockRows, txRows, txCountResult] = await Promise.all([
            db_1.db.query('SELECT * FROM blocks ORDER BY height ASC'),
            db_1.db.query(`
        SELECT hash, block_height, from_address, to_address, value, gas_price, gas_limit, nonce, data, signature
        FROM transactions
        WHERE block_height IS NOT NULL AND status = 'confirmed'
        ORDER BY block_height ASC, created_at ASC
      `),
            db_1.db.query(`SELECT COUNT(*)::int AS count FROM transactions WHERE status = 'confirmed'`),
        ]);
        const transactionsByHeight = new Map();
        for (const row of txRows.rows) {
            const transaction = {
                hash: row.hash,
                from: row.from_address,
                to: row.to_address,
                value: BigInt(row.value),
                gasPrice: BigInt(row.gas_price),
                gasLimit: BigInt(row.gas_limit),
                nonce: Number(row.nonce),
                data: row.data || undefined,
                signature: row.signature,
            };
            const items = transactionsByHeight.get(Number(row.block_height)) || [];
            items.push(transaction);
            transactionsByHeight.set(Number(row.block_height), items);
        }
        if (blockRows.rows.length === 0) {
            return false;
        }
        this.blocks = blockRows.rows.map((row) => this.rowToBlock(row, transactionsByHeight.get(Number(row.height)) || []));
        this.totalTransactions = Number(txCountResult.rows[0]?.count || 0);
        return true;
    }
    async initialize() {
        try {
            const metadataResult = await db_1.db.query(`SELECT key, value FROM chain_state WHERE key IN ('genesis_time', 'chain_id', 'network_name')`);
            const metadata = new Map(metadataResult.rows.map((row) => [row.key, row.value]));
            // Always pin genesis to the canonical Hermeschain epoch.
            // If the DB has a stale value from before the pin landed, overwrite it.
            this.genesisTime = HERMESCHAIN_GENESIS_MS;
            await db_1.db.query(`INSERT INTO chain_state (key, value)
         VALUES ('genesis_time', $1)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`, [String(this.genesisTime)]).catch(() => { });
            await db_1.db.query(`INSERT INTO chain_state (key, value)
         VALUES ('chain_id', '1337')
         ON CONFLICT (key) DO NOTHING`).catch(() => { });
            await db_1.db.query(`INSERT INTO chain_state (key, value)
         VALUES ('network_name', 'Hermeschain Mainnet')
         ON CONFLICT (key) DO NOTHING`).catch(() => { });
            const loadedExistingBlocks = await this.loadPersistedBlocks();
            if (loadedExistingBlocks) {
                console.log(`[CHAIN] Loaded ${this.blocks.length} stored blocks and ${this.totalTransactions} stored transactions`);
            }
            else {
                const genesis = this.createGenesisBlock();
                this.blocks = [genesis];
                this.totalTransactions = 0;
                await db_1.db.query(`
          INSERT INTO blocks (
            height, hash, parent_hash, producer, timestamp, nonce, difficulty,
            gas_used, gas_limit, state_root, transactions_root, receipts_root
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (height) DO NOTHING
          `, [
                    genesis.header.height,
                    genesis.header.hash,
                    genesis.header.parentHash,
                    genesis.header.producer,
                    genesis.header.timestamp,
                    genesis.header.nonce,
                    genesis.header.difficulty,
                    genesis.header.gasUsed.toString(),
                    genesis.header.gasLimit.toString(),
                    genesis.header.stateRoot,
                    genesis.header.transactionsRoot,
                    genesis.header.receiptsRoot,
                ]).catch(() => { });
                console.log('[CHAIN] Created persistent genesis block');
            }
            await db_1.chainState.saveChainStartTime(this.genesisTime);
            await db_1.chainState.saveBlockHeight(this.getChainLength());
            await db_1.chainState.saveTotalTransactions(this.totalTransactions);
        }
        catch (error) {
            console.error('[CHAIN] DB error, using in-memory:', error);
            const genesis = this.createGenesisBlock();
            this.blocks = [genesis];
            this.totalTransactions = 0;
        }
    }
    async refreshFromDb() {
        try {
            const loadedExistingBlocks = await this.loadPersistedBlocks();
            if (!loadedExistingBlocks && this.blocks.length === 0) {
                const genesis = this.createGenesisBlock();
                this.blocks = [genesis];
                this.totalTransactions = 0;
            }
        }
        catch (error) {
            console.error('[CHAIN] Failed to refresh from DB:', error);
        }
    }
    rowToBlock(row, transactions = []) {
        const block = new Block_1.Block(row.height, row.parent_hash, row.producer, transactions, row.difficulty);
        // Override header with actual values from DB
        block.header.hash = row.hash;
        block.header.timestamp = parseInt(row.timestamp, 10);
        block.header.nonce = row.nonce;
        block.header.gasUsed = BigInt(row.gas_used);
        block.header.gasLimit = BigInt(row.gas_limit);
        block.header.stateRoot = row.state_root;
        block.header.transactionsRoot = row.transactions_root;
        block.header.receiptsRoot = row.receipts_root;
        return block;
    }
    createGenesisBlock() {
        const genesis = new Block_1.Block(0, GENESIS_PARENT_HASH, 'HermesGenesisValidator', [], this.difficulty);
        genesis.header.timestamp = this.genesisTime;
        return genesis;
    }
    async addBlock(block) {
        const lastBlock = this.getLatestBlock();
        if (this.blocks.length > 0 && !block.isValid(lastBlock)) {
            console.error('Invalid block rejected');
            return false;
        }
        this.blocks.push(block);
        this.totalTransactions += block.transactions.length;
        try {
            // Save to PostgreSQL
            await db_1.db.query(`
      INSERT INTO blocks (
        height, hash, parent_hash, producer, timestamp, nonce, difficulty,
        gas_used, gas_limit, state_root, transactions_root, receipts_root
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (height) DO UPDATE SET
          hash = EXCLUDED.hash,
          timestamp = EXCLUDED.timestamp
    `, [
                block.header.height,
                block.header.hash,
                block.header.parentHash,
                block.header.producer,
                block.header.timestamp,
                block.header.nonce,
                block.header.difficulty,
                block.header.gasUsed.toString(),
                block.header.gasLimit.toString(),
                block.header.stateRoot,
                block.header.transactionsRoot,
                block.header.receiptsRoot
            ]);
            // Save transactions
            for (const tx of block.transactions) {
                await db_1.db.query(`
        INSERT INTO transactions (
          hash, block_height, from_address, to_address, value, gas_price,
          gas_limit, nonce, data, signature, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'confirmed')
          ON CONFLICT (hash) DO UPDATE SET status = 'confirmed'
      `, [
                    tx.hash, block.header.height, tx.from, tx.to,
                    tx.value.toString(), tx.gasPrice.toString(), tx.gasLimit.toString(),
                    tx.nonce, tx.data || null, tx.signature
                ]);
            }
            // Update Redis cache
            await db_1.chainState.saveBlockHeight(this.getChainLength());
            await db_1.chainState.saveTotalTransactions(this.totalTransactions);
            await db_1.chainState.saveBlock(block.toJSON());
        }
        catch (error) {
            console.error('Error saving block to database:', error);
            // Block still added to memory, will retry on next save
        }
        return true;
    }
    getLatestBlock() {
        return this.blocks[this.blocks.length - 1];
    }
    getBlockByHeight(height) {
        return this.blocks.find(b => b.header.height === height);
    }
    getBlockByHash(hash) {
        return this.blocks.find(b => b.header.hash === hash);
    }
    getAllBlocks() {
        return [...this.blocks];
    }
    getChainLength() {
        const latestBlock = this.getLatestBlock();
        return latestBlock ? latestBlock.header.height + 1 : this.blocks.length;
    }
    // Get actual stored block count (different from time-based height)
    getStoredBlockCount() {
        return this.blocks.length;
    }
    getGenesisTime() {
        return this.genesisTime;
    }
    getTotalTransactions() {
        return this.totalTransactions;
    }
    getStoredTransactionCount() {
        return this.totalTransactions;
    }
    /**
     * Transactions-per-second over the last `windowSec` seconds.
     * Sums transactions in blocks whose header timestamp is within the
     * window; divides by the window length. Returns 0 on an empty chain.
     */
    getRecentTps(windowSec = 60) {
        const cutoffMs = Date.now() - windowSec * 1000;
        let count = 0;
        for (let i = this.blocks.length - 1; i >= 0; i -= 1) {
            const block = this.blocks[i];
            if (block.header.timestamp < cutoffMs)
                break;
            count += block.transactions.length;
        }
        return Number((count / windowSec).toFixed(2));
    }
    // Get recent blocks for context
    getRecentBlocks(count = 10) {
        return this.blocks.slice(-count);
    }
    // Handle chain reorganization
    async handleReorg(newBlocks, commonAncestorHeight) {
        const result = {
            success: false,
            orphaned: [],
            added: []
        };
        // Validate reorg depth
        const reorgDepth = this.blocks.length - commonAncestorHeight - 1;
        if (reorgDepth > MAX_REORG_DEPTH) {
            console.error(`[CHAIN] Reorg too deep: ${reorgDepth} > ${MAX_REORG_DEPTH}`);
            return result;
        }
        // Get blocks being orphaned
        result.orphaned = this.blocks.slice(commonAncestorHeight + 1);
        // Validate new blocks form a valid chain
        for (let i = 0; i < newBlocks.length; i++) {
            const block = newBlocks[i];
            const prevBlock = i === 0
                ? this.blocks[commonAncestorHeight]
                : newBlocks[i - 1];
            if (!block.isValid(prevBlock)) {
                console.error(`[CHAIN] Invalid block in reorg chain at height ${block.header.height}`);
                return result;
            }
        }
        // Check that new chain is longer
        const newLength = commonAncestorHeight + 1 + newBlocks.length;
        if (newLength <= this.blocks.length) {
            console.log(`[CHAIN] New chain not longer: ${newLength} <= ${this.blocks.length}`);
            return result;
        }
        console.log(`[CHAIN] Reorganizing: depth=${reorgDepth}, orphaning ${result.orphaned.length} blocks, adding ${newBlocks.length}`);
        // Truncate main chain to common ancestor
        this.blocks = this.blocks.slice(0, commonAncestorHeight + 1);
        // Add new blocks
        for (const block of newBlocks) {
            const added = await this.addBlock(block);
            if (added) {
                result.added.push(block);
            }
            else {
                console.error(`[CHAIN] Failed to add block ${block.header.height} during reorg`);
                // Try to restore orphaned blocks
                for (const orphan of result.orphaned) {
                    await this.addBlock(orphan);
                }
                return result;
            }
        }
        // Move orphaned blocks to orphan pool for potential reprocessing
        this.orphanedBlocks.push(...result.orphaned);
        // Emit reorg event
        EventBus_1.eventBus.emit('chain_reorg', {
            depth: reorgDepth,
            orphanedCount: result.orphaned.length,
            addedCount: result.added.length,
            newHeight: this.blocks.length
        });
        result.success = true;
        console.log(`[CHAIN] Reorg complete. New height: ${this.blocks.length}`);
        return result;
    }
    // Find common ancestor between current chain and new blocks
    findCommonAncestor(newBlocks) {
        if (newBlocks.length === 0)
            return this.blocks.length - 1;
        const firstNewBlock = newBlocks[0];
        // Find where the new chain connects
        for (let i = this.blocks.length - 1; i >= 0; i--) {
            if (this.blocks[i].header.hash === firstNewBlock.header.parentHash) {
                return i;
            }
        }
        // Check if it connects to an orphaned block
        for (const orphan of this.orphanedBlocks) {
            if (orphan.header.hash === firstNewBlock.header.parentHash) {
                // Need deeper search
                return -1;
            }
        }
        return -1; // No common ancestor found
    }
    // Get orphaned blocks
    getOrphanedBlocks() {
        return [...this.orphanedBlocks];
    }
    // Clear old orphans
    pruneOrphans(maxAge = 3600000) {
        const cutoff = Date.now() - maxAge;
        const before = this.orphanedBlocks.length;
        this.orphanedBlocks = this.orphanedBlocks.filter(b => b.header.timestamp > cutoff);
        return before - this.orphanedBlocks.length;
    }
    getStats() {
        const latestBlock = this.getLatestBlock();
        const avgBlockTime = this.blocks.length > 1
            ? Math.max(0, Math.round((this.blocks[this.blocks.length - 1].header.timestamp - this.blocks[0].header.timestamp) /
                (this.blocks.length - 1)))
            : DEFAULT_BLOCK_INTERVAL_MS;
        return {
            height: this.getChainLength(),
            totalTransactions: this.getTotalTransactions(),
            genesisTime: this.genesisTime,
            orphanedBlocks: this.orphanedBlocks.length,
            latestBlockTime: latestBlock?.header.timestamp || this.genesisTime,
            avgBlockTime,
            storedBlocks: this.blocks.length,
            storedTransactions: this.totalTransactions
        };
    }
}
exports.Chain = Chain;
//# sourceMappingURL=Chain.js.map