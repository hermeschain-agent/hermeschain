# Wallet Import / Export Format

**Task:** phase-09 / wallet-format / step-1 (design)

## Goal

A text-serializable wallet file that can move between the CLI, browser extension, and mobile wallet without re-deriving keys each time.

## File shape (JSON)

```json
{
  "version": 1,
  "format": "hermes-wallet-v1",
  "createdAtMs": 1700000000000,
  "keystore": {
    "cipher": "aes-256-gcm",
    "cipherparams": { "iv": "<hex>" },
    "ciphertext": "<hex>",
    "kdf": "pbkdf2",
    "kdfparams": {
      "iterations": 310000,
      "salt": "<hex>",
      "dklen": 32
    },
    "mac": "<hex>"
  },
  "publicKey": "<32-byte hex>",
  "address": "<derived from publicKey>"
}
```

The private key is encrypted with a user-supplied passphrase via PBKDF2 + AES-256-GCM. Industry-standard; matches the Ethereum V3 keystore shape conceptually but with updated primitives.

## Encryption flow

1. User provides passphrase.
2. `kdf = pbkdf2-sha256(passphrase, salt, 310_000)` → 32 bytes.
3. `key = kdf[:32]`, `mac_key = kdf[16:]`.
4. `ciphertext = AES-256-GCM(key, iv, privateKey)`.
5. `mac = HMAC-SHA256(mac_key, ciphertext)` for tamper detection.
6. Serialize as JSON.

## Decryption flow

1. User provides passphrase.
2. Re-derive KDF output.
3. Verify MAC. Mismatch → wrong passphrase or tampered file, abort.
4. Decrypt.
5. Verify derived public key matches the `publicKey` field — cross-check in case a tampered file swapped only the public key.

## Non-goals

- No BIP-39 mnemonic support yet — separate workstream.
- No hardware-wallet bridging — EIP-712 signing comes later.
- No browser-native WebAuthn integration — forward-compat via a `kdf: 'webauthn'` variant.

## Security notes

- PBKDF2 iterations of 310k matches OWASP 2023 recommendation.
- GCM provides authentication; HMAC over ciphertext is belt-and-suspenders for format migration (a future KDF might change the MAC slot).
- Never log the decrypted key; the CLI clears it from memory after use.
