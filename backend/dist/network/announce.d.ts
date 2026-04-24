/**
 * On startup, announce ourselves to any peers listed in
 * HERMES_BOOTSTRAP_PEERS (comma-separated URLs). Re-announces on a
 * heartbeat so the far end doesn't mark us stale.
 */
export interface SelfIdentity {
    peerId: string;
    url: string;
    publicKey: string;
    getChainHeight: () => number;
}
export declare function startBootstrapHeartbeat(self: SelfIdentity): void;
export declare function stopBootstrapHeartbeat(): void;
//# sourceMappingURL=announce.d.ts.map