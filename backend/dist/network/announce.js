"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startBootstrapHeartbeat = startBootstrapHeartbeat;
exports.stopBootstrapHeartbeat = stopBootstrapHeartbeat;
const PeerRegistry_1 = require("./PeerRegistry");
const HEARTBEAT_MS = 60000;
let heartbeatInterval = null;
function getBootstrapUrls() {
    const raw = process.env.HERMES_BOOTSTRAP_PEERS || '';
    return raw
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}
async function announceOnce(targetUrl, self) {
    try {
        const body = JSON.stringify({
            peerId: self.peerId,
            url: self.url,
            publicKey: self.publicKey,
            chainHeight: self.getChainHeight(),
        });
        const res = await fetch(`${targetUrl.replace(/\/$/, '')}/api/mesh/announce`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body,
        });
        if (!res.ok) {
            console.warn(`[MESH] announce to ${targetUrl} returned ${res.status}`);
            return;
        }
        const data = await res.json().catch(() => ({}));
        if (Array.isArray(data.peers)) {
            for (const p of data.peers) {
                if (p?.peerId && p.peerId !== self.peerId) {
                    PeerRegistry_1.peerRegistry.registerPeer({
                        peerId: p.peerId,
                        url: p.url,
                        chainHeight: Number(p.chainHeight) || 0,
                        publicKey: p.publicKey || '',
                    });
                }
            }
        }
    }
    catch (err) {
        console.warn(`[MESH] announce to ${targetUrl} failed:`, err?.message || err);
    }
}
function startBootstrapHeartbeat(self) {
    const urls = getBootstrapUrls();
    if (urls.length === 0)
        return;
    const tick = () => {
        for (const url of urls)
            void announceOnce(url, self);
        PeerRegistry_1.peerRegistry.evictStale();
    };
    tick();
    heartbeatInterval = setInterval(tick, HEARTBEAT_MS);
    console.log(`[MESH] announcing to ${urls.length} bootstrap peer(s) every ${HEARTBEAT_MS / 1000}s`);
}
function stopBootstrapHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
}
//# sourceMappingURL=announce.js.map