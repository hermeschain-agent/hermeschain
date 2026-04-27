import { EventBus } from './EventBus';
export interface BridgeHandle {
    detach(): void;
}
export declare function attachRedisBridge(eventBus: EventBus, redisUrl: string): BridgeHandle;
//# sourceMappingURL=RedisBridge.d.ts.map