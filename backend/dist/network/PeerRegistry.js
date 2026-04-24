"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.peerRegistry = exports.PeerRegistry = exports.STALE_MS = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const DATA_DIR = path.join(process.cwd(), 'data');
const PEERS_FILE = path.join(DATA_DIR, 'peers.json');
exports.STALE_MS = 180000;
class PeerRegistry {
    constructor() {
        this.peers = new Map();
        this.load();
    }
    registerPeer(input) {
        const peer = { ...input, lastSeenMs: Date.now() };
        this.peers.set(peer.peerId, peer);
        this.persist();
        return peer;
    }
    listPeers() {
        const cutoff = Date.now() - exports.STALE_MS;
        return Array.from(this.peers.values()).filter((p) => p.lastSeenMs >= cutoff);
    }
    allPeers() {
        return Array.from(this.peers.values());
    }
    getPeer(peerId) {
        return this.peers.get(peerId);
    }
    evictStale() {
        const cutoff = Date.now() - exports.STALE_MS;
        let evicted = 0;
        for (const [id, p] of this.peers.entries()) {
            if (p.lastSeenMs < cutoff) {
                this.peers.delete(id);
                evicted++;
            }
        }
        if (evicted > 0)
            this.persist();
        return evicted;
    }
    load() {
        try {
            if (!fs.existsSync(PEERS_FILE))
                return;
            const raw = fs.readFileSync(PEERS_FILE, 'utf-8');
            const list = JSON.parse(raw);
            for (const p of list) {
                if (p && p.peerId && p.url)
                    this.peers.set(p.peerId, p);
            }
        }
        catch (err) {
            console.warn('[PEERS] load failed:', err?.message || err);
        }
    }
    persist() {
        try {
            if (!fs.existsSync(DATA_DIR))
                fs.mkdirSync(DATA_DIR, { recursive: true });
            fs.writeFileSync(PEERS_FILE, JSON.stringify(this.allPeers(), null, 2));
        }
        catch (err) {
            console.warn('[PEERS] persist failed:', err?.message || err);
        }
    }
}
exports.PeerRegistry = PeerRegistry;
exports.peerRegistry = new PeerRegistry();
//# sourceMappingURL=PeerRegistry.js.map