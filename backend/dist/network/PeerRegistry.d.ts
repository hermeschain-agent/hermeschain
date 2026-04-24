/**
 * HTTP-gossip peer registry. Peers announce themselves periodically;
 * anyone who hasn't reheartbeat within STALE_MS is evicted. The in-memory
 * map is authoritative; the JSON file on disk is a crash-recovery aid.
 */
export interface Peer {
    peerId: string;
    url: string;
    chainHeight: number;
    publicKey: string;
    lastSeenMs: number;
}
export declare const STALE_MS = 180000;
export declare class PeerRegistry {
    private peers;
    constructor();
    registerPeer(input: Omit<Peer, 'lastSeenMs'>): Peer;
    listPeers(): Peer[];
    allPeers(): Peer[];
    getPeer(peerId: string): Peer | undefined;
    evictStale(): number;
    private load;
    private persist;
}
export declare const peerRegistry: PeerRegistry;
//# sourceMappingURL=PeerRegistry.d.ts.map