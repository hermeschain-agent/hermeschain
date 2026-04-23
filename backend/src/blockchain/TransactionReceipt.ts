import crypto from 'crypto';
import { Transaction, generateHash } from './Block';
import { db } from '../database/db';

// Transaction execution status
export enum TransactionStatus {
  SUCCESS = 1,
  FAILURE = 0,
  OUT_OF_GAS = 2,
  INVALID_SIGNATURE = 3,
  INSUFFICIENT_BALANCE = 4,
  INVALID_NONCE = 5
}

// Log entry emitted during transaction execution
export interface Log {
  address: string;      // Contract address that emitted the log
  topics: string[];     // Indexed event parameters
  data: string;         // Non-indexed event data
  logIndex: number;     // Position in the block
  transactionIndex: number;
  transactionHash: string;
  blockHash: string;
  blockNumber: number;
}

// Transaction receipt
export interface TransactionReceipt {
  transactionHash: string;
  transactionIndex: number;
  blockHash: string;
  blockNumber: number;
  from: string;
  to: string;
  gasUsed: bigint;
  cumulativeGasUsed: bigint;
  status: TransactionStatus;
  logs: Log[];
  logsBloom: string;    // Bloom filter for quick log searching
  stateRoot?: string;   // Post-transaction state root (optional)
}

// Create a bloom filter for logs (simplified)
function createLogsBloom(logs: Log[]): string {
  // 256-byte bloom filter
  const bloom = Buffer.alloc(256);
  
  for (const log of logs) {
    // Add address to bloom
    addToBloom(bloom, log.address);
    
    // Add topics to bloom
    for (const topic of log.topics) {
      addToBloom(bloom, topic);
    }
  }
  
  return bloom.toString('hex');
}

// Add item to bloom filter
function addToBloom(bloom: Buffer, item: string): void {
  const hash = crypto.createHash('sha256').update(item).digest();
  
  // Use first 6 bytes to set 3 bits
  for (let i = 0; i < 3; i++) {
    const index = (hash[i * 2] << 8 | hash[i * 2 + 1]) % 2048;
    const byteIndex = Math.floor(index / 8);
    const bitIndex = index % 8;
    bloom[byteIndex] |= (1 << bitIndex);
  }
}

// Check if item might be in bloom filter
export function bloomContains(bloomHex: string, item: string): boolean {
  const bloom = Buffer.from(bloomHex, 'hex');
  const hash = crypto.createHash('sha256').update(item).digest();
  
  for (let i = 0; i < 3; i++) {
    const index = (hash[i * 2] << 8 | hash[i * 2 + 1]) % 2048;
    const byteIndex = Math.floor(index / 8);
    const bitIndex = index % 8;
    if ((bloom[byteIndex] & (1 << bitIndex)) === 0) {
      return false;
    }
  }
  return true;
}

// Create a receipt from a transaction execution
export function createReceipt(
  tx: Transaction,
  index: number,
  blockHash: string,
  blockNumber: number,
  gasUsed: bigint,
  cumulativeGasUsed: bigint,
  status: TransactionStatus,
  logs: Log[] = [],
  stateRoot?: string
): TransactionReceipt {
  return {
    transactionHash: tx.hash,
    transactionIndex: index,
    blockHash,
    blockNumber,
    from: tx.from,
    to: tx.to,
    gasUsed,
    cumulativeGasUsed,
    status,
    logs,
    logsBloom: createLogsBloom(logs),
    stateRoot
  };
}

// Calculate receipts Merkle root
export function calculateReceiptsRoot(receipts: TransactionReceipt[]): string {
  if (receipts.length === 0) {
    return generateHash('empty_receipts');
  }
  
  const receiptHashes = receipts.map(receipt => {
    const data = JSON.stringify({
      transactionHash: receipt.transactionHash,
      status: receipt.status,
      gasUsed: receipt.gasUsed.toString(),
      cumulativeGasUsed: receipt.cumulativeGasUsed.toString(),
      logsBloom: receipt.logsBloom,
      logs: receipt.logs
    });
    return generateHash(data);
  });
  
  return buildMerkleRoot(receiptHashes);
}

// Build Merkle root from hashes
function buildMerkleRoot(hashes: string[]): string {
  if (hashes.length === 1) return hashes[0];
  
  const nextLevel: string[] = [];
  for (let i = 0; i < hashes.length; i += 2) {
    const left = hashes[i];
    const right = hashes[i + 1] || left;
    nextLevel.push(generateHash(left + right));
  }
  
  return buildMerkleRoot(nextLevel);
}

// Encode receipt for RLP (simplified)
export function encodeReceipt(receipt: TransactionReceipt): string {
  return JSON.stringify({
    status: receipt.status,
    gasUsed: receipt.gasUsed.toString(),
    logsBloom: receipt.logsBloom,
    logs: receipt.logs
  });
}

// In-memory cache keyed by tx hash. Populated on write + lazy-filled on
// read-miss from the DB. Survives the single process; DB is authoritative.
const receiptCache = new Map<string, TransactionReceipt>();

function serializeLogs(logs: Log[]): string {
  try {
    return JSON.stringify(logs);
  } catch {
    return '[]';
  }
}

function parseLogs(raw: string | null | undefined): Log[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function rowToReceipt(row: any): TransactionReceipt {
  return {
    transactionHash: row.tx_hash,
    transactionIndex: Number(row.tx_index ?? 0),
    blockHash: row.block_hash,
    blockNumber: Number(row.block_number ?? 0),
    from: row.from_address,
    to: row.to_address,
    gasUsed: BigInt(row.gas_used ?? '0'),
    cumulativeGasUsed: BigInt(row.cumulative_gas_used ?? '0'),
    status: Number(row.status ?? TransactionStatus.FAILURE) as TransactionStatus,
    logs: parseLogs(row.logs_json),
    logsBloom: row.logs_bloom ?? '',
    stateRoot: row.state_root || undefined,
  };
}

// Store a receipt — writes to both the in-memory cache and the receipts table.
// If the DB write fails (no PG, transient error), the cache still serves reads
// for the lifetime of this process.
export function storeReceipt(receipt: TransactionReceipt): void {
  receiptCache.set(receipt.transactionHash, receipt);
  void db
    .query(
      `
      INSERT INTO receipts (
        tx_hash, tx_index, block_hash, block_number, from_address, to_address,
        gas_used, cumulative_gas_used, status, logs_json, logs_bloom, state_root
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (tx_hash) DO UPDATE SET
        tx_index = EXCLUDED.tx_index,
        block_hash = EXCLUDED.block_hash,
        block_number = EXCLUDED.block_number,
        from_address = EXCLUDED.from_address,
        to_address = EXCLUDED.to_address,
        gas_used = EXCLUDED.gas_used,
        cumulative_gas_used = EXCLUDED.cumulative_gas_used,
        status = EXCLUDED.status,
        logs_json = EXCLUDED.logs_json,
        logs_bloom = EXCLUDED.logs_bloom,
        state_root = EXCLUDED.state_root
      `,
      [
        receipt.transactionHash,
        receipt.transactionIndex,
        receipt.blockHash,
        receipt.blockNumber,
        receipt.from,
        receipt.to,
        receipt.gasUsed.toString(),
        receipt.cumulativeGasUsed.toString(),
        receipt.status,
        serializeLogs(receipt.logs),
        receipt.logsBloom,
        receipt.stateRoot || null,
      ]
    )
    .catch((err) => {
      console.warn('[RECEIPTS] Persistence write failed:', err?.message || err);
    });
}

// Synchronous getter — returns the cached value if present. For the
// post-restart path where the cache is cold, call loadReceipt() below.
export function getReceipt(txHash: string): TransactionReceipt | undefined {
  return receiptCache.get(txHash);
}

// Async loader that falls through to the DB when the cache doesn't have it.
// Populates the cache on a hit so subsequent reads are sync-fast.
export async function loadReceipt(txHash: string): Promise<TransactionReceipt | undefined> {
  const cached = receiptCache.get(txHash);
  if (cached) return cached;
  try {
    const result = await db.query(
      `SELECT * FROM receipts WHERE tx_hash = $1 LIMIT 1`,
      [txHash]
    );
    if (result.rows.length === 0) return undefined;
    const receipt = rowToReceipt(result.rows[0]);
    receiptCache.set(txHash, receipt);
    return receipt;
  } catch (err: any) {
    console.warn('[RECEIPTS] Load failed:', err?.message || err);
    return undefined;
  }
}

// All receipts for a block. Falls back to DB when the cache is incomplete.
export function getBlockReceipts(blockNumber: number): TransactionReceipt[] {
  return Array.from(receiptCache.values())
    .filter((r) => r.blockNumber === blockNumber);
}

export async function loadBlockReceipts(blockNumber: number): Promise<TransactionReceipt[]> {
  try {
    const result = await db.query(
      `SELECT * FROM receipts WHERE block_number = $1 ORDER BY tx_index ASC`,
      [blockNumber]
    );
    const receipts = result.rows.map(rowToReceipt);
    for (const r of receipts) receiptCache.set(r.transactionHash, r);
    return receipts;
  } catch (err: any) {
    console.warn('[RECEIPTS] Load block failed:', err?.message || err);
    return getBlockReceipts(blockNumber);
  }
}

console.log('[RECEIPTS] Transaction receipt system loaded');
