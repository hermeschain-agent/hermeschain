# Section 03 — Wallet & Accounts Specs (TASK-106..140)

35 tasks. HD derivation, mnemonic flows, multi-sig, ENS-like names, contact book, token primitives, faucet hardening, batch send, scheduling, hardware-key + session-key delegation, account-abstraction stub, social recovery, encrypted export/import, vanity gen, metrics.

**Preconditions used throughout:**
- Wallet API: [backend/src/api/wallet.ts](backend/src/api/wallet.ts) — current send/balance/faucet handlers.
- Crypto: [backend/src/blockchain/Crypto.ts](backend/src/blockchain/Crypto.ts) — `generateKeypair`, `derivePublicKey`, `sign`, `verify`, `verifyTransactionSignature`.
- State: [StateManager.ts](backend/src/blockchain/StateManager.ts) — `getBalance`, `getNonce`.
- Tx pool: [TransactionPool.ts](backend/src/blockchain/TransactionPool.ts) — `addTransaction`.
- DB: standard `db.query`.

---

### TASK-106 — HD wallet derivation BIP32-style

**Section:** wallet
**Effort:** L
**Depends on:** none
**Type:** new-file

**Goal**
One mnemonic → many addresses via deterministic derivation. Reduces user key-management burden; matches industry conventions.

**Files**
- new: `backend/src/wallet/hd.ts` — `seedFromMnemonic(mnemonic): Buffer`, `deriveKeypair(seed, path): {pub, priv}`.
- add deps: `bip39`, `ed25519-hd-key`.

**Implementation sketch**
- `bip39.mnemonicToSeedSync(mnemonic)` → 64-byte seed.
- Path format `m/44'/9999'/0'/0/N` (9999 = our coin type).
- `ed25519-hd-key.derivePath(path, seed.toString('hex')).key` → 32-byte priv.
- Public key via existing `derivePublicKey`.

**Acceptance**
- [ ] Same mnemonic → same address sequence.
- [ ] Different paths → different addresses.

**Verification**
- Unit: known mnemonic → known addresses.

---

### TASK-107 — Mnemonic export endpoint

**Section:** wallet
**Effort:** S
**Depends on:** TASK-106
**Type:** new-file

**Goal**
Authenticated wallets can retrieve their mnemonic for backup. Heavily rate-limited.

**Files**
- new: `POST /api/wallet/:addr/mnemonic/export` (in wallet.ts).

**Reuses**
- Mnemonic store side (assumes mnemonic was stored encrypted at create-time).
- TASK-351 rate limit (1/min).

**API contract**
```
POST /api/wallet/:addr/mnemonic/export
body: { signature: '<over export:addr:ts>' }
→ 200 { mnemonic: '...', warning: 'never share' }
→ 401 { error: 'invalid signature' }
```

**Acceptance**
- [ ] Valid sig → mnemonic returned.
- [ ] Invalid → 401.

**Verification**
- Sign + curl.

---

### TASK-108 — Mnemonic import + recovery

**Section:** wallet
**Effort:** M
**Depends on:** TASK-106
**Type:** new-file

**Goal**
User pastes a mnemonic; we derive their addresses + scan for any with on-chain history.

**Files**
- new: `POST /api/wallet/import` body: `{ mnemonic, scanCount: 20 }`.

**Implementation sketch**
- Derive `scanCount` addresses.
- For each: query `/api/account/:addr` to get balance + nonce.
- Return list with non-zero or non-zero-nonce addresses flagged as active.

**Acceptance**
- [ ] Existing mnemonic returns its known addresses.

**Verification**
- Import a known mnemonic.

---

### TASK-109 — Watch-only address mode

**Section:** wallet
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
Users can add an address to track without holding the key. UI shows balance + activity, no send button.

**Files**
- new: `POST /api/wallet/watch` body: `{ address }`.
- new: `GET /api/wallet/watched/:userKey`.

**Implementation sketch**
- Per-session list of watched addresses (cookie-keyed) or per-API-key.
- Just metadata; no key storage.

**Acceptance**
- [ ] Watched address appears in list.

**Verification**
- Add + read.

---

### TASK-110 — Multi-sig wallet primitive

**Section:** wallet
**Effort:** L
**Depends on:** TASK-070, TASK-079
**Type:** new-file

**Goal**
Deploy an m-of-n multi-sig contract; all signers must approve to send.

**Files**
- new: `examples/multisig/{source.hsm,program.json,README.md}` (overlaps with TASK-105).
- new: `backend/src/wallet/multisig.ts` — helper to construct & deploy.

**Implementation sketch**
- Multi-sig stores list of owners + threshold M.
- Tx submission via `propose(target, value, data)` → returns proposal id.
- Approve via `confirm(proposalId, signature)`.
- Execute when M confirmations collected.

**Acceptance**
- [ ] 2-of-3 multisig: 1 approval insufficient, 2 sufficient.

**Verification**
- E2E test.

---

### TASK-111 — Wallet name aliases

**Section:** wallet
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
Per-user nickname for any address (off-chain, scoped to API key).

**Files**
- new: `backend/src/database/migrations/0022_wallet_aliases.sql` — `wallet_aliases(api_key_hash, address, alias, PK(api_key_hash, address))`.
- new: CRUD endpoints `GET/POST/DELETE /api/wallet/aliases`.

**Acceptance**
- [ ] Aliases scoped to user.

**Verification**
- Add + read.

---

### TASK-112 — ENS-like /api/names/:name resolver

**Section:** wallet
**Effort:** M
**Depends on:** none
**Type:** new-file

**Goal**
Global on-chain name → address registry. First-claim wins.

**Files**
- new: `backend/src/database/migrations/0023_names.sql` — `names(name TEXT PK, address, owner, registered_at, expires_at)`.
- new: `backend/src/api/names.ts` — register, transfer, resolve.

**API contract**
```
GET /api/names/:name → 200 { address }
POST /api/names body: { name, signature } → 200 { ok: true }
```

**Acceptance**
- [ ] Names resolvable.

**Verification**
- Register + resolve.

---

### TASK-113 — Reverse name lookup

**Section:** wallet
**Effort:** S
**Depends on:** TASK-112
**Type:** new-file

**Goal**
Address → registered name(s).

**Files**
- new: `GET /api/names/reverse/:addr` → `{ names: [...] }`.

**Acceptance**
- [ ] Returns names where address matches.

**Verification**
- Curl.

---

### TASK-114 — Wallet activity feed

**Section:** wallet
**Effort:** M
**Depends on:** TASK-058
**Type:** edit

**Goal**
Combined send/receive/contract-event timeline for an address.

**Files**
- edit: `backend/src/api/wallet.ts` — `GET /api/wallet/:addr/activity?cursor=&limit=`.

**Reuses**
- TASK-058 history; TASK-161 events.

**API contract**
```
→ 200 { items: [{ type: 'send'|'receive'|'event', ts, ...details }], next_cursor }
```

**Acceptance**
- [ ] Mixed feed returned in time order.

**Verification**
- Curl.

---

### TASK-115 — CSV export of wallet history

**Section:** wallet
**Effort:** S
**Depends on:** TASK-114
**Type:** edit

**Goal**
Same data as TASK-114 but CSV for spreadsheets/tax tools.

**Files**
- new: `GET /api/wallet/:addr/activity.csv?from=&to=`.

**Implementation sketch**
- Stream CSV rows with header.

**Acceptance**
- [ ] Returns valid CSV.

**Verification**
- `curl > out.csv && head out.csv`.

---

### TASK-116 — /api/wallet/:addr/qr.png

**Section:** wallet
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
QR code PNG for an address (for receive screens).

**Files**
- new: `GET /api/wallet/:addr/qr.png?size=256`.
- add dep: `qrcode`.

**Implementation sketch**
- `QRCode.toBuffer(addr, { width: size })` → res.

**Acceptance**
- [ ] PNG returned with correct content-type.

**Verification**
- Curl, view image.

---

### TASK-117 — Wallet contact book

**Section:** wallet
**Effort:** S
**Depends on:** TASK-111
**Type:** new-file

**Goal**
Per-user contact list (alias + address + notes).

**Files**
- new: migration `wallet_contacts` table.
- new: CRUD endpoints.

**Acceptance**
- [ ] Add + list contacts.

**Verification**
- Curl.

---

### TASK-118 — Token balance aggregation

**Section:** wallet
**Effort:** M
**Depends on:** TASK-105 (erc20-like example)
**Type:** new-file

**Goal**
Across all deployed token contracts, return user's holdings.

**Files**
- new: `GET /api/wallet/:addr/tokens` → `{ tokens: [{ contractAddress, symbol, balance }] }`.

**Implementation sketch**
- Query `contract_metadata` for contracts with `symbol` field.
- For each, run a balance read against `contract_storage`.

**Acceptance**
- [ ] Lists all balances > 0.

**Verification**
- Curl.

---

### TASK-119 — Approve / transferFrom flow for tokens

**Section:** wallet
**Effort:** S
**Depends on:** TASK-105
**Type:** docs + helper

**Goal**
Standard ERC20-like allowance flow. Document in /docs and provide helper endpoints that build the txs.

**Files**
- new: `POST /api/wallet/token/:contract/approve` body: `{spender, amount, signature}` → constructed tx.

**Acceptance**
- [ ] Approve + transferFrom round-trip works.

**Verification**
- Two-tx test.

---

### TASK-120 — Allowance lookup endpoint

**Section:** wallet
**Effort:** S
**Depends on:** TASK-119
**Type:** new-file

**Goal**
Read `allowance(owner, spender)` from a token contract.

**Files**
- new: `GET /api/wallet/token/:contract/allowance/:owner/:spender`.

**Acceptance**
- [ ] Returns numeric allowance.

**Verification**
- Curl.

---

### TASK-121 — Token transfer history per-account

**Section:** wallet
**Effort:** S
**Depends on:** TASK-114
**Type:** new-file

**Goal**
Filter activity feed to just token transfers (Transfer event topic).

**Files**
- new: `GET /api/wallet/:addr/token-history?contract=`.

**Acceptance**
- [ ] Returns Transfer events involving this address.

**Verification**
- Curl.

---

### TASK-122 — Faucet rate-limit by IP not just address

**Section:** wallet
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
Current faucet limits per address (24h cooldown). Also limit by IP to prevent address-rotation abuse.

**Files**
- edit: `backend/src/api/wallet.ts` faucet handler.

**Implementation sketch**
- Track `faucet_ip_drips(ip, last_drip_at, count_24h)` in Redis with TTL.
- Cap: 5 drips per IP per 24h.

**Acceptance**
- [ ] Same IP across 6 different addresses → 6th rejected.

**Verification**
- Loop curl from same IP.

---

### TASK-123 — Faucet captcha hook

**Section:** wallet
**Effort:** M
**Depends on:** TASK-122
**Type:** edit

**Goal**
Optional hCaptcha verification before faucet drip.

**Files**
- edit: faucet handler.
- add dep: `hcaptcha` (or fetch directly).

**Implementation sketch**
- If `HCAPTCHA_SECRET` env set: require `captchaToken` field, verify against hCaptcha.
- Else: skip (dev/staging).

**Acceptance**
- [ ] Without token (when configured): rejected.
- [ ] Valid token: passes.

**Verification**
- Test in staging.

---

### TASK-124 — Faucet drip dynamic amount

**Section:** wallet
**Effort:** S
**Depends on:** none
**Type:** edit

**Goal**
Adjust drip size based on demand (queue depth) and pool reserves.

**Files**
- edit: faucet handler.

**Implementation sketch**
- Base = 100 OPEN.
- If pool reserves < 1000 OPEN: drip /= 4.
- If queue length > 100/min: drip /= 2.

**Acceptance**
- [ ] Drip amount reduces under low reserves.

**Verification**
- Drain pool, check next drip.

---

### TASK-125 — Faucet pool refill schedule

**Section:** wallet
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
Auto-refill faucet pool from a treasury address on a schedule.

**Files**
- new: `backend/src/wallet/faucetRefiller.ts` — interval that monitors pool, sends from treasury when below threshold.

**Implementation sketch**
- Threshold via env (default 5000 OPEN).
- Refill amount: 50000 OPEN at a time.
- Treasury private key from env (sealed).

**Acceptance**
- [ ] Pool refills on schedule.

**Verification**
- Drop pool below threshold, observe.

---

### TASK-126 — Wallet send batch (many recipients)

**Section:** wallet
**Effort:** M
**Depends on:** TASK-169
**Type:** new-file

**Goal**
Single signed payload sends to N recipients (one tx per recipient).

**Files**
- new: `POST /api/wallet/send-batch` body: `{ from, recipients: [{to, amount}], signature }`.

**Implementation sketch**
- Verify signature over canonical message.
- Construct N txs with sequential nonces.
- Use bulk submit (TASK-169).

**Acceptance**
- [ ] All txs accepted with correct nonces.

**Verification**
- Send to 3 recipients in one call.

---

### TASK-127 — Tx scheduling (broadcast at future height)

**Section:** wallet
**Effort:** M
**Depends on:** none
**Type:** new-file

**Goal**
Submit a signed tx now to be broadcast when chain reaches height H.

**Files**
- new: migration `scheduled_txs(hash PK, target_height, payload_json, status, scheduled_by)`.
- new: `POST /api/wallet/schedule` body: `{ tx, height }`.
- new: scheduler interval that submits when height matches.

**Acceptance**
- [ ] Tx scheduled at height N executes at or after N.

**Verification**
- Schedule + wait.

---

### TASK-128 — Tx replacement UI flow (cancel-by-replace)

**Section:** wallet
**Effort:** S
**Depends on:** TASK-168
**Type:** docs

**Goal**
Document the cancel flow + provide a one-call helper.

**Files**
- new: `docs/wallet/cancel-tx.md`.

**Acceptance**
- [ ] Doc walks through with curl examples.

**Verification**
- Manual.

---

### TASK-129 — Hardware-key signing protocol stub

**Section:** wallet
**Effort:** M
**Depends on:** none
**Type:** new-file

**Goal**
Stub protocol for Ledger-style flow: backend constructs unsigned tx, sends to client, client signs on hw device, returns sig, backend submits.

**Files**
- new: `backend/src/wallet/hardwareSigning.ts`.
- new: docs `/docs/wallet/hardware-keys.md`.

**Implementation sketch**
- `POST /api/wallet/sign-request` body: `{ from, to, value }` → `{ unsignedTx, message }`.
- Client side responsibility: sign on device.
- `POST /api/wallet/sign-submit` body: `{ unsignedTx, signature }`.

**Acceptance**
- [ ] Stub round-trip works with software signer simulating hw.

**Verification**
- Dev test.

---

### TASK-130 — Session key delegation

**Section:** wallet
**Effort:** M
**Depends on:** none
**Type:** new-file

**Goal**
Sign once with master key to authorize a session key with scoped permissions (max value, expiry).

**Files**
- new: migration `session_keys(id, master_address, session_pubkey, max_value, expires_at, signature)`.
- new: middleware that accepts session-key signatures for txs within scope.

**Acceptance**
- [ ] Tx signed by session key within scope: accepted.
- [ ] Out-of-scope: rejected.

**Verification**
- Dev test.

---

### TASK-131 — Account abstraction stub: paymaster

**Section:** wallet
**Effort:** M
**Depends on:** TASK-079
**Type:** new-file

**Goal**
Allow gasless tx: paymaster contract pays the gas on behalf of the sender.

**Files**
- new: `examples/paymaster/{source.hsm,program.json}`.
- edit: BlockProducer to accept paymaster-stamped txs (charge fee to paymaster, not sender).

**Acceptance**
- [ ] Tx with valid paymaster authorization: sender pays nothing.

**Verification**
- E2E test.

---

### TASK-132 — Wallet-side mempool view

**Section:** wallet
**Effort:** S
**Depends on:** TASK-166
**Type:** new-file

**Goal**
Filter `/api/mempool` to txs from/to a specific address.

**Files**
- new: `GET /api/wallet/:addr/pending`.

**Acceptance**
- [ ] Returns only txs touching this address.

**Verification**
- Curl after submit.

---

### TASK-133 — Wallet recovery via social guardians

**Section:** wallet
**Effort:** L
**Depends on:** TASK-110
**Type:** new-file

**Goal**
3-of-5 friends approve a recovery to swap the master key on an account.

**Files**
- new: `examples/social-recovery/...`.
- new: `POST /api/wallet/recovery/setup` body: `{guardians: [...]}`.
- new: `POST /api/wallet/recovery/initiate` body: `{newKey, signatures}`.

**Implementation sketch**
- Recovery contract holds the guardian set.
- M-of-N approve a `setKey(newPubKey)` call.
- Time-lock 24h before swap takes effect.

**Acceptance**
- [ ] Recovery flow works.

**Verification**
- E2E test.

---

### TASK-134 — Per-account gas budget cap

**Section:** wallet
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
Account-level cap on gas burn per 24h. Prevents runaway scripts from draining.

**Files**
- new: migration `account_gas_caps(address PK, max_24h, used_24h, period_started)`.
- edit: TransactionPool — reject if cap would exceed.

**Acceptance**
- [ ] Tx beyond cap: rejected.

**Verification**
- Set low cap, attempt tx.

---

### TASK-135 — Wallet password-encrypted export

**Section:** wallet
**Effort:** M
**Depends on:** TASK-107
**Type:** new-file

**Goal**
Export wallet (mnemonic + addresses) as JSON encrypted with PBKDF2 + AES-256-GCM keyed by user password.

**Files**
- new: `backend/src/wallet/encryptedExport.ts` — `exportEncrypted(walletData, password)`, `decryptImport(blob, password)`.

**Implementation sketch**
- PBKDF2-SHA256, 100k iterations, 32-byte key.
- AES-256-GCM with random 12-byte IV.
- JSON envelope: `{ kdf: 'pbkdf2', iterations, salt, iv, ciphertext, tag }`.

**Acceptance**
- [ ] Round-trip with correct password.
- [ ] Wrong password → decrypt failure.

**Verification**
- Unit.

---

### TASK-136 — Wallet import from JSON

**Section:** wallet
**Effort:** S
**Depends on:** TASK-135
**Type:** edit

**Goal**
Accept the encrypted JSON, decrypt, derive addresses.

**Files**
- new: `POST /api/wallet/import-encrypted` body: `{ blob, password }`.

**Acceptance**
- [ ] Successful decrypt restores wallet.

**Verification**
- Round-trip.

---

### TASK-137 — Address validity checker endpoint

**Section:** wallet
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
Pre-flight check: is this string a valid Hermes address? (base58 + length + checksum).

**Files**
- new: `GET /api/wallet/validate/:input`.

**API contract**
```
→ 200 { valid: true|false, reason?: 'bad-base58'|'wrong-length'|'bad-checksum' }
```

**Acceptance**
- [ ] Valid address: true.
- [ ] Garbage: false with reason.

**Verification**
- Curl.

---

### TASK-138 — Vanity address generator script

**Section:** wallet
**Effort:** S
**Depends on:** none
**Type:** script

**Goal**
Given a prefix, brute-force keypairs until address starts with prefix. CLI.

**Files**
- new: `backend/scripts/vanity-address.ts`.

**Implementation sketch**
- Loop generateKeypair, check prefix, count attempts, print on match.
- `--prefix Hermes --max 1000000`.

**Acceptance**
- [ ] Returns address with the prefix.

**Verification**
- `npm run vanity -- --prefix abc`.

---

### TASK-139 — Bulk address generator for testing

**Section:** wallet
**Effort:** S
**Depends on:** none
**Type:** script

**Goal**
Generate N keypairs at once, output JSON for test fixtures.

**Files**
- new: `backend/scripts/bulk-keys.ts`.

**Acceptance**
- [ ] Outputs N pairs.

**Verification**
- Run with N=100.

---

### TASK-140 — Wallet metrics endpoint

**Section:** wallet
**Effort:** S
**Depends on:** none
**Type:** new-file

**Goal**
Aggregate counts for ops dashboard.

**Files**
- new: `GET /api/wallet/metrics` → `{ total, active_24h, new_24h, send_volume_24h }`.

**Acceptance**
- [ ] Returns sensible numbers.

**Verification**
- Curl.

---

## Summary

35 tasks: 21 small, 11 medium, 3 large. Heavier-cluster around HD/multi-sig/social recovery (106, 110, 133); rest mostly endpoints + helpers.
