/**
 * The faucet as a REAL on-chain account.
 *
 * The chain verifies every transaction's Ed25519 signature against tx.from
 * (the address IS the public key, Solana-style). So for the faucet to dispense
 * REAL, mineable transactions — instead of mutating balances behind the chain's
 * back — it needs a genuine keypair whose public key is its funded address.
 *
 * The private key is server-held. Set HERMES_FAUCET_PRIVATE_KEY (base58, the
 * 32-byte format Crypto.sign expects) on every process that serves faucet
 * claims (the web service) so the funded genesis address is STABLE across
 * restarts and deploys. If unset (local dev), an ephemeral key is generated and
 * a warning is logged — funds won't persist across restarts because the
 * genesis-funded address changes each boot.
 */
import { generateKeypair, derivePublicKey } from './Crypto';

function resolveFaucet(): { privateKey: string; address: string; ephemeral: boolean } {
  const envKey = process.env.HERMES_FAUCET_PRIVATE_KEY?.trim();
  if (envKey) {
    try {
      return { privateKey: envKey, address: derivePublicKey(envKey), ephemeral: false };
    } catch (err) {
      console.error('[FAUCET] HERMES_FAUCET_PRIVATE_KEY is not a valid base58 Ed25519 key:', err);
      throw new Error('Invalid HERMES_FAUCET_PRIVATE_KEY');
    }
  }
  const kp = generateKeypair();
  console.warn(
    '[FAUCET] HERMES_FAUCET_PRIVATE_KEY not set — generated an EPHEMERAL faucet key ' +
      `(${kp.publicKey.slice(0, 12)}...). Set it in production so the funded faucet ` +
      'address is stable across restarts.',
  );
  return { privateKey: kp.privateKey, address: kp.publicKey, ephemeral: true };
}

const faucet = resolveFaucet();

/** base58 Ed25519 private key the server signs faucet transactions with. */
export const FAUCET_PRIVATE_KEY = faucet.privateKey;
/** base58(publicKey) — the faucet's real on-chain address, funded at genesis. */
export const FAUCET_PUBLIC_ADDRESS = faucet.address;
/** True when the key was generated (not provided via env) — dev only. */
export const FAUCET_KEY_IS_EPHEMERAL = faucet.ephemeral;
