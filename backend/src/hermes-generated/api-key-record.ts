/**
 * ApiKey record + tier resolution.
 *
 * Phase-7 / multi-tenant / step-2. Plain DB-backed model; secrets
 * are stored as bcrypt hashes, never plaintext. Lookup-by-prefix
 * (first 8 chars after `pk_live_`) is indexed for fast auth.
 */

export type Tier = 'free' | 'starter' | 'pro';

export interface ApiKey {
  readonly id: string;
  readonly prefix: string;          // 'pk_live_abcd1234'
  readonly secretHash: string;      // bcrypt of the full key
  readonly ownerEmail: string;
  readonly tier: Tier;
  readonly createdAtMs: number;
  readonly expiresAtMs: number | null;
  readonly revokedAt: number | null;
}

export interface TierLimits {
  readonly rps: number;
  readonly dailyCap: number;
  readonly burst: number;
}

const TIER_LIMITS: Readonly<Record<Tier, TierLimits>> = Object.freeze({
  free:    Object.freeze({ rps: 5,   dailyCap: 50_000,    burst: 25    }),
  starter: Object.freeze({ rps: 50,  dailyCap: 1_000_000, burst: 200   }),
  pro:     Object.freeze({ rps: 500, dailyCap: Number.MAX_SAFE_INTEGER, burst: 2_000 }),
});

export function limitsFor(tier: Tier): TierLimits {
  return TIER_LIMITS[tier];
}

export function isUsable(key: ApiKey, now: number = Date.now()): boolean {
  if (key.revokedAt !== null) return false;
  if (key.expiresAtMs !== null && key.expiresAtMs <= now) return false;
  return true;
}

export function makeApiKey(input: ApiKey): ApiKey {
  if (!input.prefix.startsWith('pk_live_')) {
    throw new Error("apikey: prefix must begin with 'pk_live_'");
  }
  if (!input.ownerEmail.includes('@')) {
    throw new Error('apikey: ownerEmail must look like an email');
  }
  if (!(['free', 'starter', 'pro'] as const).includes(input.tier)) {
    throw new Error(`apikey: unknown tier "${input.tier}"`);
  }
  if (!input.secretHash || input.secretHash.length < 30) {
    throw new Error('apikey: secretHash looks invalid');
  }
  return Object.freeze({ ...input });
}
