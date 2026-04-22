# BIP-39 Mnemonic Support Plan

**Task:** phase-09 / mnemonic / step-1 (design)

## Why

Users lose passphrases. They rarely lose memorable 12-word phrases. Mnemonic phrases are the industry default for wallet backup because they trade one forgettable string for 12-24 memorable words.

## Generation

```
entropy  = randomBytes(16)                      // 128 bits → 12 words
checksum = sha256(entropy)[:4 bits]
bits     = entropy || checksum                  // 132 bits
words    = [BIP39_WORDLIST[bits[i*11:(i+1)*11]] for i in 0..11]
phrase   = words.join(' ')
```

24-word phrase: 32 bytes of entropy + 8-bit checksum.

## Seed derivation

```
seed = pbkdf2-sha512(
  passphrase = phrase,
  salt       = 'mnemonic' + optionalPassphrase,
  iterations = 2048,
  dklen      = 64,
)
```

A user may add an optional *passphrase* on top of the mnemonic. This is the "25th word" that only the user knows — steals the paper, they still can't restore.

## Key derivation

BIP-32 hierarchical derivation:
```
m/44'/HERMES_COIN_TYPE'/0'/0/N
```

Each account in the wallet is `N = 0, 1, 2, ...`. `HERMES_COIN_TYPE` is registered with SLIP-0044 (assigned number pending).

## Storage

- Mnemonic is **never** persisted. User is responsible for recording it (paper backup).
- Derived private keys live in the keystore format from the previous workstream.
- Re-entering the mnemonic regenerates the same keys deterministically.

## User flow (CLI)

```
$ hermes wallet create
[1] Generating fresh mnemonic...
[2] Your 12-word backup phrase:

    gravity lunar spark drift monsoon
    orbit feather ember shallow current
    whisper index

    Write this down. Store it offline. If you lose it, your funds are lost.

[3] Press Enter once you've recorded it.
[4] Wallet created at ~/.hermes/wallets/0xab...json
```

## Non-goals

- No seed phrase social recovery — that's account-abstraction territory, separate workstream.
- No multi-mnemonic wallets in one file — simpler to have one file per mnemonic.
