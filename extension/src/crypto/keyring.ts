/**
 * Hermes wallet keyring — self-custody Ed25519 keys derived from a BIP39
 * mnemonic, encoded to match the Hermeschain backend EXACTLY so signatures
 * verify against the existing chain:
 *   - curve: Ed25519
 *   - address = base58(publicKey). The backend's POST /api/wallet/send verifies
 *     the signature using the `from` address AS the public key, so a base58
 *     pubkey address interoperates with no backend change.
 *   - signature: Ed25519 over the UTF-8 bytes of the canonical message,
 *     base58-encoded.
 *   - base58: standard Bitcoin alphabet, identical to the backend's.
 * Private keys are derived on-device and never sent to any server.
 */
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import { hmac } from '@noble/hashes/hmac';
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import bs58 from 'bs58';

// SLIP-44-style coin type for Hermes (placeholder until/if registered).
const HERMES_COIN_TYPE = 9009;
const enc = new TextEncoder();

export interface HermesAccount {
  /** base58(publicKey) — also the on-chain address the backend verifies against. */
  address: string;
  publicKey: string;
  /** base58(privateKey, 32 bytes). Secret — never transmit. */
  privateKey: string;
  derivationPath: string;
  index: number;
}

export interface SignedSend {
  fromAddress: string;
  toAddress: string;
  amount: string;
  nonce: number;
  timestampMs: number;
  signature: string;
}

export function generateMnemonicPhrase(words: 12 | 24 = 12): string {
  return generateMnemonic(wordlist, words === 24 ? 256 : 128);
}

export function isValidMnemonic(phrase: string): boolean {
  return validateMnemonic(phrase.trim(), wordlist);
}

/** SLIP-0010 hardened path; Ed25519 supports hardened derivation only. */
export function accountPath(index = 0): string {
  return `m/44'/${HERMES_COIN_TYPE}'/${index}'/0'/0'`;
}

// ---- SLIP-0010 (Ed25519) key derivation ------------------------------------

interface Slip10Node {
  key: Uint8Array;
  chainCode: Uint8Array;
}

function slip10Master(seed: Uint8Array): Slip10Node {
  const I = hmac(sha512, enc.encode('ed25519 seed'), seed);
  return { key: I.slice(0, 32), chainCode: I.slice(32) };
}

function ser32Hardened(index: number): Uint8Array {
  const i = (index + 0x80000000) >>> 0;
  return new Uint8Array([(i >>> 24) & 0xff, (i >>> 16) & 0xff, (i >>> 8) & 0xff, i & 0xff]);
}

function slip10DeriveChild(parent: Slip10Node, index: number): Slip10Node {
  const data = new Uint8Array(1 + 32 + 4);
  data[0] = 0x00;
  data.set(parent.key, 1);
  data.set(ser32Hardened(index), 33);
  const I = hmac(sha512, parent.chainCode, data);
  return { key: I.slice(0, 32), chainCode: I.slice(32) };
}

function derivePrivateKey(seed: Uint8Array, path: string): Uint8Array {
  let node = slip10Master(seed);
  for (const segment of path.split('/').slice(1)) {
    node = slip10DeriveChild(node, parseInt(segment.replace(/'$/, ''), 10));
  }
  return node.key;
}

// ---- Accounts --------------------------------------------------------------

export async function accountFromMnemonic(phrase: string, index = 0): Promise<HermesAccount> {
  if (!isValidMnemonic(phrase)) throw new Error('invalid mnemonic');
  const seed = mnemonicToSeedSync(phrase.trim());
  const path = accountPath(index);
  const priv = derivePrivateKey(seed, path);
  const pub = await ed.getPublicKeyAsync(priv);
  const address = bs58.encode(pub);
  return { address, publicKey: address, privateKey: bs58.encode(priv), derivationPath: path, index };
}

export async function accountFromPrivateKey(privateKeyBase58: string): Promise<HermesAccount> {
  const priv = bs58.decode(privateKeyBase58);
  if (priv.length !== 32) throw new Error('private key must be 32 bytes (base58)');
  const pub = await ed.getPublicKeyAsync(priv);
  const address = bs58.encode(pub);
  return { address, publicKey: address, privateKey: privateKeyBase58, derivationPath: 'imported', index: 0 };
}

// ---- Signing (matches backend buildSendMessage + Ed25519 verify) -----------

export function buildSendMessage(input: {
  fromAddress: string;
  toAddress: string;
  amount: number | string;
  nonce: number;
  timestampMs: number;
}): string {
  return JSON.stringify({
    kind: 'wallet.send.v1',
    from: input.fromAddress,
    to: input.toAddress,
    amount: String(input.amount),
    nonce: input.nonce,
    timestampMs: input.timestampMs,
  });
}

export async function signMessage(message: string, privateKeyBase58: string): Promise<string> {
  const sig = await ed.signAsync(enc.encode(message), bs58.decode(privateKeyBase58));
  return bs58.encode(sig);
}

/** Build + sign a transfer that POST /api/wallet/send will accept. */
export async function signSend(
  account: HermesAccount,
  input: { toAddress: string; amount: number | string; nonce: number; timestampMs?: number },
): Promise<SignedSend> {
  const timestampMs = input.timestampMs ?? Date.now();
  const message = buildSendMessage({
    fromAddress: account.address,
    toAddress: input.toAddress,
    amount: input.amount,
    nonce: input.nonce,
    timestampMs,
  });
  return {
    fromAddress: account.address,
    toAddress: input.toAddress,
    amount: String(input.amount),
    nonce: input.nonce,
    timestampMs,
    signature: await signMessage(message, account.privateKey),
  };
}
