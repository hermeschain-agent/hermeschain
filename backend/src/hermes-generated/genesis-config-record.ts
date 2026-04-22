/**
 * Canonical GenesisConfig record.
 *
 * Step-2 of foundation/genesis-config. Replaces the scattered env reads
 * and hardcoded strings the audit found with one typed, frozen struct.
 *
 * Treat this as append-only at runtime. Any field change invalidates
 * block 0's hash, so migrations must happen at chain reset.
 */

export interface InitialAllocation {
  readonly address: string;
  readonly balance: string; // big-number string to avoid JS Number precision loss
}

export interface InitialValidator {
  readonly address: string;
  readonly publicKey: string;
  readonly weight: number;
}

export interface GenesisConfig {
  readonly chainId: string;
  readonly protocolVersion: string;
  readonly genesisTimestampMs: number;
  readonly blockTimeTargetMs: number;
  readonly initialValidators: readonly InitialValidator[];
  readonly initialAllocations: readonly InitialAllocation[];
}

export function makeGenesisConfig(input: {
  chainId: string;
  protocolVersion: string;
  genesisTimestampMs: number;
  blockTimeTargetMs: number;
  initialValidators: InitialValidator[];
  initialAllocations: InitialAllocation[];
}): GenesisConfig {
  if (!input.chainId || !input.chainId.trim()) {
    throw new Error('genesis: chainId is required');
  }
  if (!/^\d+\.\d+\.\d+$/.test(input.protocolVersion)) {
    throw new Error(`genesis: protocolVersion must be semver, got "${input.protocolVersion}"`);
  }
  if (input.genesisTimestampMs <= 0) {
    throw new Error('genesis: genesisTimestampMs must be positive');
  }
  if (input.blockTimeTargetMs <= 0) {
    throw new Error('genesis: blockTimeTargetMs must be positive');
  }
  if (input.initialValidators.length === 0) {
    throw new Error('genesis: at least one initial validator is required');
  }
  const validatorWeightSum = input.initialValidators.reduce(
    (sum, v) => sum + v.weight,
    0,
  );
  if (validatorWeightSum <= 0) {
    throw new Error('genesis: total validator weight must be positive');
  }

  return Object.freeze({
    chainId: input.chainId.trim(),
    protocolVersion: input.protocolVersion,
    genesisTimestampMs: input.genesisTimestampMs,
    blockTimeTargetMs: input.blockTimeTargetMs,
    initialValidators: Object.freeze(
      input.initialValidators.map((v) => Object.freeze({ ...v })),
    ),
    initialAllocations: Object.freeze(
      input.initialAllocations.map((a) => Object.freeze({ ...a })),
    ),
  });
}

/**
 * Sum of all initial balances as a big-number-safe string. Used by the
 * state-root computation at genesis.
 */
export function totalInitialSupply(config: GenesisConfig): string {
  let total = 0n;
  for (const a of config.initialAllocations) {
    total += BigInt(a.balance);
  }
  return total.toString();
}
