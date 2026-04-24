"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMeshRouter = createMeshRouter;
const express_1 = require("express");
const PeerRegistry_1 = require("./PeerRegistry");
const EventBus_1 = require("../events/EventBus");
/**
 * HTTP peer-mesh router. Mounted at /api/mesh by server.ts so it doesn't
 * collide with the pre-existing agent-chat forum at /api/network.
 *
 *   GET  /api/mesh/peers      — list active peers (lastSeen within 180s)
 *   POST /api/mesh/announce   — register / heartbeat a peer
 *   GET  /api/mesh/head       — return our chain head
 *   POST /api/mesh/block      — accept a gossiped block (currently header-only)
 */
function createMeshRouter(chain) {
    const router = (0, express_1.Router)();
    router.get('/peers', (_req, res) => {
        res.json({ peers: PeerRegistry_1.peerRegistry.listPeers() });
    });
    router.post('/announce', (req, res) => {
        const { peerId, url, chainHeight, publicKey } = req.body || {};
        if (!peerId || !url) {
            return res.status(400).json({ error: 'peerId and url required' });
        }
        const peer = PeerRegistry_1.peerRegistry.registerPeer({
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
            peers: PeerRegistry_1.peerRegistry.listPeers(),
        });
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
    router.post('/block', (req, res) => {
        // Gossip acceptance is conservative: we log the claim + emit an event
        // so monitors can see the incoming block, but we don't apply it to our
        // chain until the full gossip deserializer + verification pipeline is
        // wired (it needs Block.fromJSON, which doesn't exist yet).
        const body = req.body || {};
        const height = Number(body?.header?.height ?? body?.height ?? -1);
        const hash = String(body?.header?.hash ?? body?.hash ?? '');
        const producer = String(body?.header?.producer ?? body?.producer ?? '');
        if (height < 0 || !hash) {
            return res.status(400).json({ accepted: false, reason: 'missing height or hash' });
        }
        EventBus_1.eventBus.emit('mesh_block_received', { height, hash, producer });
        const head = chain.getLatestBlock();
        res.json({
            accepted: false,
            reason: 'gossip-apply pending Block.fromJSON deserializer',
            head: { height: chain.getChainLength(), hash: head?.header.hash || '' },
        });
    });
    return router;
}
//# sourceMappingURL=api.js.map