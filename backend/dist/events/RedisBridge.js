"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.attachRedisBridge = attachRedisBridge;
const ioredis_1 = __importDefault(require("ioredis"));
/**
 * Cross-replica event bridge over Redis pub/sub (TASK-330).
 *
 * The local EventBus is in-process; SSE clients on replica A miss events
 * emitted on replica B. This bridge republishes whitelisted local events
 * to a Redis channel and re-emits incoming channel messages locally.
 *
 * Loop prevention: every bridged payload is tagged with `_origin` (this
 * replica's id). Echoes from the same origin are dropped.
 */
const CHANNEL = 'hermes:events:v1';
const BRIDGED_EVENTS = [
    'block_produced',
    'consensus_quorum',
    'consensus_failed',
    'chain_reorg',
    'mesh_block_received',
    'ci_results',
    'ci_failure',
    'ci_watch_triggered',
    'network_message',
    'state_root_mismatch',
];
function attachRedisBridge(eventBus, redisUrl) {
    const originId = process.env.REPLICA_ID || `${process.pid}@${require('os').hostname()}`;
    const publisher = new ioredis_1.default(redisUrl);
    const subscriber = new ioredis_1.default(redisUrl);
    const localHandlers = new Map();
    for (const name of BRIDGED_EVENTS) {
        const handler = (payload) => {
            // Don't republish messages we just received from the channel.
            if (payload && payload.__bridged)
                return;
            const wrapped = JSON.stringify({ event: name, payload, _origin: originId });
            publisher.publish(CHANNEL, wrapped).catch((err) => console.warn(`[REDIS BRIDGE] publish ${name} failed: ${err?.message || err}`));
        };
        eventBus.on(name, handler);
        localHandlers.set(name, handler);
    }
    subscriber.subscribe(CHANNEL).catch((err) => console.error(`[REDIS BRIDGE] subscribe failed: ${err?.message || err}`));
    subscriber.on('message', (_channel, raw) => {
        try {
            const msg = JSON.parse(raw);
            if (msg._origin === originId)
                return; // skip our own
            if (!BRIDGED_EVENTS.includes(msg.event))
                return;
            // Mark so the local handler doesn't re-publish.
            const payload = { ...(msg.payload ?? {}), __bridged: true };
            eventBus.emit(msg.event, payload);
        }
        catch (err) {
            console.warn(`[REDIS BRIDGE] bad message: ${err?.message || err}`);
        }
    });
    console.log(`[REDIS BRIDGE] attached as ${originId} on channel ${CHANNEL}`);
    return {
        detach() {
            for (const [name, handler] of localHandlers.entries()) {
                eventBus.off(name, handler);
            }
            subscriber.unsubscribe(CHANNEL).catch(() => { });
            subscriber.disconnect();
            publisher.disconnect();
        },
    };
}
//# sourceMappingURL=RedisBridge.js.map