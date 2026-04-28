import { Router } from 'express';
import type { Chain } from '../blockchain/Chain';
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
export declare function createJsonRpcRouter(chain: Chain): Router;
//# sourceMappingURL=jsonrpc.d.ts.map