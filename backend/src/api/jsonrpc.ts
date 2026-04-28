import { Router } from 'express';
import type { Chain } from '../blockchain/Chain';
import { stateManager } from '../blockchain/StateManager';

/**
 * Minimal Ethereum JSON-RPC compat layer (TASK-176).
 *
 * Mounted at POST /rpc. MetaMask + eth-tools that expect this protocol
 * can read chain height + balance. Methods beyond this minimal set
 * return -32601 (method not found).
 *
 * Methods implemented:
 *   eth_blockNumber              → 0xN
 *   eth_getBalance(addr, _tag)   → 0xN
 *   eth_chainId                  → 0x... (HERMES_CHAIN_ID env or default)
 *   net_version                  → string of chain id
 */
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
        default:
          return respond(undefined, { code: -32601, message: `method not found: ${method}` });
      }
    } catch (err: any) {
      return respond(undefined, { code: -32603, message: err?.message || 'internal error' });
    }
  });

  return router;
}
