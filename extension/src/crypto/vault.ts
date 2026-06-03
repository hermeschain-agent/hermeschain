/**
 * Encrypted keystore. The seed phrase is encrypted with a key derived from the
 * user's password (PBKDF2-SHA256 → AES-256-GCM). Only the ciphertext is
 * persisted; the plaintext seed exists in memory only while the wallet is
 * unlocked. Uses WebCrypto, available in both the extension and Node (tests).
 */

const PBKDF2_ITERATIONS = 210_000; // OWASP-recommended floor for PBKDF2-SHA256
const enc = new TextEncoder();
const dec = new TextDecoder();

export interface EncryptedVault {
  v: 1;
  salt: string; // base64
  iv: string; // base64
  ciphertext: string; // base64 (AES-GCM, includes auth tag)
}

function toB64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(b64: string): Uint8Array {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptVault(password: string, plaintext: string): Promise<EncryptedVault> {
  if (!password) throw new Error('password required');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext)),
  );
  return { v: 1, salt: toB64(salt), iv: toB64(iv), ciphertext: toB64(ct) };
}

export async function decryptVault(password: string, vault: EncryptedVault): Promise<string> {
  const key = await deriveKey(password, fromB64(vault.salt));
  try {
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(vault.iv) },
      key,
      fromB64(vault.ciphertext),
    );
    return dec.decode(pt);
  } catch {
    // AES-GCM auth failure ⇒ wrong password or tampered ciphertext.
    throw new Error('incorrect password');
  }
}
