/**
 * Typed feature flag registry.
 *
 * Phase-8 / feature-flags / step-2. Flags are static-at-boot, not
 * hot-reloadable — changing a flag requires a service restart. This
 * is deliberate: flags that flip at runtime create nondeterminism
 * between nodes that's catastrophic for consensus.
 */

export interface FlagSpec<T> {
  readonly key: string;
  readonly default: T;
  readonly description: string;
  readonly scope: 'node' | 'chain';
}

export class FeatureFlags {
  private readonly values = new Map<string, unknown>();

  register<T extends string | number | boolean>(spec: FlagSpec<T>, envReader: () => string | undefined): void {
    const raw = envReader();
    if (raw === undefined) {
      this.values.set(spec.key, spec.default);
      return;
    }
    if (typeof spec.default === 'boolean') {
      this.values.set(spec.key, raw === 'true' || raw === '1');
    } else if (typeof spec.default === 'number') {
      const n = Number(raw);
      if (!Number.isFinite(n)) {
        throw new Error(`flag: ${spec.key} expects number, got "${raw}"`);
      }
      this.values.set(spec.key, n);
    } else {
      this.values.set(spec.key, raw);
    }
  }

  get<T>(key: string): T {
    if (!this.values.has(key)) {
      throw new Error(`flag: "${key}" not registered`);
    }
    return this.values.get(key) as T;
  }

  snapshot(): Record<string, unknown> {
    return Object.fromEntries(this.values);
  }
}

/** Default singleton. */
export const flags = new FeatureFlags();

/** Register every flag on boot. Reading is lazy. */
export function registerCoreFlags(env: NodeJS.ProcessEnv = process.env): void {
  const read = (name: string) => env[name];
  flags.register(
    { key: 'wire.binary', default: false, description: 'opt-in binary wire format', scope: 'node' },
    () => read('HERMES_WIRE_BINARY'),
  );
  flags.register(
    { key: 'agent.autopilot', default: false, description: 'autonomous task selection', scope: 'node' },
    () => read('HERMES_AGENT_AUTOPILOT'),
  );
  flags.register(
    { key: 'rpc.multi-tenant', default: false, description: 'per-key tiers', scope: 'node' },
    () => read('HERMES_RPC_MULTI_TENANT'),
  );
}
