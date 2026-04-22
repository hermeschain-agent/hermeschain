# Concept: Accounts and Keys

**Task:** phase-10 / concept / step-1 (docs)

## Two kinds of account

### Externally-owned account (EOA)

- One ed25519 keypair.
- Signs transactions with the private key.
- Address is derived from the public key.
- Never needs to be "created" on-chain — the first tx *from* an EOA creates its state record.

### Contract account

- Has `codeHash` + `storageRoot`.
- Doesn't sign; controlled by its code.
- Created via `CREATE` or `CREATE2` transaction.

Account abstraction blurs the line: a smart account is a contract that plays the EOA role by implementing `validateUserOp`. See [account-abstraction](./account-abstraction.md).

## Keys

Private keys are 32 random bytes. They're never sent over the network; they live encrypted in the keystore file or in-memory in wallet software.

Public keys are derived from private keys via ed25519 curve scalar multiplication.

Addresses are `keccak256(publicKey)[-20:]` (20 bytes, hex-encoded with `0x` prefix).

## Key lifecycle

1. **Generate** from a mnemonic via BIP-32 HD derivation, or directly from OS randomness.
2. **Encrypt** with a passphrase into the keystore file.
3. **Use** by decrypting on each signing operation.
4. **Rotate** by creating a new account, transferring balance, deprecating the old one. The protocol itself doesn't track "rotation" — it's just two separate accounts.

## What you can do with an account

- Receive funds (no key needed — anyone can send).
- Send funds (needs private key).
- Be a validator (needs stake + registration tx).
- Be a delegator (stake to someone else's validator).

## Common mistakes

- **Losing the mnemonic** — no recovery. The chain has no "forgot password" flow.
- **Reusing a mnemonic** across chains — other chains' compromised validators can sign on this chain too.
- **Storing the mnemonic digitally** — a photo in cloud storage is as exposed as the wallet it backs.
