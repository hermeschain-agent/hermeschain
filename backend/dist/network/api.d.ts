import { Router } from 'express';
import { Chain } from '../blockchain/Chain';
/**
 * HTTP peer-mesh router. Mounted at /api/mesh by server.ts so it doesn't
 * collide with the pre-existing agent-chat forum at /api/network.
 *
 *   GET  /api/mesh/peers      — list active peers (lastSeen within 180s)
 *   POST /api/mesh/announce   — register / heartbeat a peer
 *   GET  /api/mesh/head       — return our chain head
 *   POST /api/mesh/block      — accept a gossiped block (currently header-only)
 */
export declare function createMeshRouter(chain: Chain): Router;
//# sourceMappingURL=api.d.ts.map