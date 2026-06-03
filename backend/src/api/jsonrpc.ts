import { Router } from 'express';
import type { Chain } from '../blockchain/Chain';
import type { Block, Transaction } from '../blockchain/Block';
import { stateManager } from '../blockchain/StateManager';

/**
 * Minimal Ethereum JSON-RPC compat layer (TASK-176).
 *
 * Mounted at POST /rpc (public, read-only). MetaMask + eth tooling that expect
 * this protocol can read chain height, balances, blocks, and transactions.
 * Writes are NOT accepted here — Hermeschain txs are Ed25519/base58 JSON, not
 * RLP; submit via POST /api/transactions instead. Unknown methods return -32601.
 *
 * Methods:
 *   eth_blockNumber                     → 0xN (real persisted height)
 *   eth_chainId                         → 0x1f407 (HERMES_CHAIN_ID env or default)
 *   net_version                         → decimal chain id
 *   eth_gasPrice                        → 0x1 (min gas price)
 *   eth_getBalance(addr,_tag)           → 0xN wei
 *   eth_getTransactionCount(addr,_tag)  → 0xN nonce
 *   eth_getBlockByNumber(tag,full)      → block | null
 *   eth_getBlockByHash(hash,full)       → block | null
 *   eth_getTransactionByHash(hash)      → tx | null
 *   web3_clientVersion                  → string
 *
 * Note: block timestamps are returned as UNIX SECONDS (eth convention),
 * converted from the chain's native milliseconds. Addresses are Solana-style
 * base58 strings, not 0x-hex.
 */

const toHex = (n: number | bigint): string => '0x' + BigInt(n).toString(16);

function resolveBlock(chain: Chain, tag: unknown): Block | undefined {
  if (tag == null || tag === 'latest' || tag === 'pending' || tag === 'safe' || tag === 'finalized') {
    return chain.getLatestBlock();
  }
  if (tag === 'earliest') return chain.getBlockByHeight(0);
  const s = String(tag);
  const n = s.startsWith('0x') ? parseInt(s, 16) : parseInt(s, 10);
  return Number.isNaN(n) ? undefined : chain.getBlockByHeight(n);
}

function txToEth(tx: Transaction, block: Block, index: number) {
  return {
    hash: tx.hash,
    from: tx.from,
    to: tx.to,
    value: toHex(tx.value),
    gas: toHex(tx.gasLimit),
    gasPrice: toHex(tx.gasPrice),
    nonce: toHex(tx.nonce),
    input: tx.data || '0x',
    blockHash: block.header.hash,
    blockNumber: toHex(block.header.height),
    transactionIndex: toHex(index),
  };
}

function blockToEth(block: Block, fullTx: boolean) {
  return {
    number: toHex(block.header.height),
    hash: block.header.hash,
    parentHash: block.header.parentHash,
    nonce: toHex(block.header.nonce),
    timestamp: toHex(Math.floor(block.header.timestamp / 1000)), // ms → s (eth)
    difficulty: toHex(block.header.difficulty),
    gasUsed: toHex(block.header.gasUsed),
    gasLimit: toHex(block.header.gasLimit),
    miner: block.header.producer,
    stateRoot: block.header.stateRoot,
    transactionsRoot: block.header.transactionsRoot,
    receiptsRoot: block.header.receiptsRoot,
    size: toHex(0),
    uncles: [] as string[],
    transactions: fullTx
      ? block.transactions.map((t, i) => txToEth(t, block, i))
      : block.transactions.map((t) => t.hash),
  };
}

function findTransaction(
  chain: Chain,
  hash: string,
): { tx: Transaction; block: Block; index: number } | null {
  const blocks = chain.getAllBlocks();
  for (let i = blocks.length - 1; i >= 0; i -= 1) {
    const idx = blocks[i].transactions.findIndex((t) => t.hash === hash);
    if (idx >= 0) return { tx: blocks[i].transactions[idx], block: blocks[i], index: idx };
  }
  return null;
}

export function createJsonRpcRouter(chain: Chain): Router {
  const router = Router();

  router.post('/', (req, res) => {
    const { id, method, params } = req.body || {};
    const respond = (result?: any, error?: { code: number; message: string }) =>
      res.json({ jsonrpc: '2.0', id: id ?? null, ...(error ? { error } : { result }) });

    const chainId = process.env.HERMES_CHAIN_ID || '0x1f407';

    try {
      switch (method) {
        case 'eth_blockNumber':
          return respond('0x' + chain.getChainLength().toString(16));
        case 'eth_chainId':
          return respond(chainId);
        case 'net_version':
          return respond(String(parseInt(chainId, 16)));
        case 'web3_clientVersion':
          return respond('Hermeschain/v1');
        case 'eth_gasPrice':
          return respond('0x1'); // MIN_GAS_PRICE
        case 'eth_getBalance': {
          const addr = (params && params[0]) || '';
          if (!addr) return respond(undefined, { code: -32602, message: 'invalid address' });
          const bal = stateManager.getBalance(addr);
          return respond('0x' + bal.toString(16));
        }
        case 'eth_getTransactionCount': {
          const addr = (params && params[0]) || '';
          if (!addr) return respond(undefined, { code: -32602, message: 'invalid address' });
          const nonce = stateManager.getNonce(addr);
          return respond('0x' + nonce.toString(16));
        }
        case 'eth_getBlockByNumber': {
          const block = resolveBlock(chain, params && params[0]);
          if (!block) return respond(null);
          return respond(blockToEth(block, Boolean(params && params[1])));
        }
        case 'eth_getBlockByHash': {
          const hash = (params && params[0]) || '';
          const block = hash ? chain.getBlockByHash(hash) : undefined;
          if (!block) return respond(null);
          return respond(blockToEth(block, Boolean(params && params[1])));
        }
        case 'eth_getTransactionByHash': {
          const hash = (params && params[0]) || '';
          const found = hash ? findTransaction(chain, hash) : null;
          if (!found) return respond(null);
          return respond(txToEth(found.tx, found.block, found.index));
        }
        default:
          return respond(undefined, { code: -32601, message: `method not found: ${method}` });
      }
    } catch (err: any) {
      return respond(undefined, { code: -32603, message: err?.message || 'internal error' });
    }
  });

  return router;
}
