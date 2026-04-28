import { Router } from 'express';
import { Chain } from '../blockchain/Chain';
import { Block } from '../blockchain/Block';
import { peerRegistry } from './PeerRegistry';
import { eventBus } from '../events/EventBus';

/**
 * HTTP peer-mesh router. Mounted at /api/mesh by server.ts so it doesn't
 * collide with the pre-existing agent-chat forum at /api/network.
 *
 *   GET  /api/mesh/peers      — list active peers (lastSeen within 180s)
 *   POST /api/mesh/announce   — register / heartbeat a peer
 *   GET  /api/mesh/head       — return our chain head
 *   POST /api/mesh/block      — accept a gossiped block (currently header-only)
 */
export function createMeshRouter(chain: Chain): Router {
  const router = Router();

  router.get('/peers', (_req, res) => {
    res.json({ peers: peerRegistry.listPeers() });
  });

  router.post('/announce', (req, res) => {
    const { peerId, url, chainHeight, publicKey } = req.body || {};
    if (!peerId || !url) {
      return res.status(400).json({ error: 'peerId and url required' });
    }
    const peer = peerRegistry.registerPeer({
      peerId: String(peerId),
      url: String(url),
      chainHeight: Number(chainHeight) || 0,
      publicKey: String(publicKey || ''),
    });
    const head = chain.getLatestBlock();
    res.json({
      ok: true,
      self: {
        height: chain.getChainLength(),
        hash: head?.header.hash || '',
      },
      peer,
      peers: peerRegistry.listPeers(),
    });
  });

  // Header-only range fetch (TASK-003) — peers measuring honest-majority
  // or chain tip don't need full transaction payloads.
  router.get('/headers', (req, res) => {
    const from = Math.max(0, Number(req.query.from ?? 0));
    const to = Math.max(from, Number(req.query.to ?? from));
    if (to - from > 1000) {
      return res.status(400).json({ error: 'range exceeds 1000' });
    }
    const headers = [];
    for (let h = from; h <= to; h++) {
      const block = chain.getBlockByHeight(h);
      if (!block) continue;
      headers.push({
        ...block.header,
        gasUsed: block.header.gasUsed.toString(),
        gasLimit: block.header.gasLimit.toString(),
      });
    }
    res.json({ headers });
  });

  // Bulk block fetch (TASK-004) — full Block.toJSON for sync.
  router.get('/blocks', (req, res) => {
    const from = Math.max(0, Number(req.query.from ?? 0));
    const to = Math.max(from, Number(req.query.to ?? from));
    if (to - from > 100) {
      return res.status(400).json({ error: 'range exceeds 100' });
    }
    const blocks = [];
    for (let h = from; h <= to; h++) {
      const block = chain.getBlockByHeight(h);
      if (block) blocks.push(block.toJSON());
    }
    res.json({ blocks });
  });

  router.get('/head', (_req, res) => {
    const head = chain.getLatestBlock();
    res.json({
      height: chain.getChainLength(),
      hash: head?.header.hash || '',
      producer: head?.header.producer || '',
      timestamp: head?.header.timestamp || 0,
    });
  });

  router.post('/block', async (req, res) => {
    // Real gossip acceptance (TASK-002): deserialize via Block.fromJSON,
    // then run through chain.addBlock which routes forks via ForkManager.
    let block: Block;
    try {
      block = Block.fromJSON(req.body);
    } catch (err: any) {
      return res.status(400).json({
        accepted: false,
        reason: `fromJSON failed: ${err?.message || err}`,
      });
    }

    eventBus.emit('mesh_block_received', {
      height: block.header.height,
      hash: block.header.hash,
      producer: block.header.producer,
    });

    try {
      const added = await chain.addBlock(block);
      const head = chain.getLatestBlock();
      if (added) {
        return res.json({
          accepted: true,
          head: { height: chain.getChainLength(), hash: head?.header.hash || '' },
        });
      }
      return res.status(409).json({
        accepted: false,
        reason: 'addBlock rejected (parent unknown, finality violation, or invalid)',
        head: { height: chain.getChainLength(), hash: head?.header.hash || '' },
      });
    } catch (err: any) {
      return res.status(409).json({
        accepted: false,
        reason: err?.message || 'addBlock threw',
      });
    }
  });

  return router;
}
