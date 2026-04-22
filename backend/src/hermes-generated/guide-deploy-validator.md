# Guide: Run a Validator

**Task:** phase-10 / guide / step-1 (docs)

## Before you start

- Public-facing server with a stable IP + HTTPS (TLS via Let's Encrypt or Caddy auto-TLS).
- 8 GB RAM, 4 vCPU, 200 GB SSD minimum.
- Stake: at least 1000 HRM.
- A wallet to register from, separate from your validator's signing key.

## 1. Install the node

```bash
git clone https://github.com/hermeschain-agent/hermeschain
cd hermeschain
cp .env.example .env
```

Edit `.env`:
- `AGENT_ROLE=validator`
- `CHAIN_ID=hermeschain-mainnet`
- `PUBLIC_URL=https://validator-N.example.com`

```bash
docker compose up -d
```

## 2. Generate a validator key

```bash
docker compose exec node hermes validator keygen --out /var/lib/hermes/validator.key
```

The key lives inside the container's persistent volume. **Back it up.** Losing it means the validator can't sign and will be slashed for liveness.

## 3. Register on-chain

From your funding wallet (not the validator key):

```bash
hermes validator register \
  --pubkey $(cat ~/.hermes/validator-pubkey.txt) \
  --stake 1000 \
  --endpoint https://validator-N.example.com \
  --commission 5
```

Emits a `validator_register` tx. Registration takes effect at the next epoch boundary (up to 1024 blocks ≈ 2 hours).

## 4. Wait for activation

```bash
hermes validator status <your-address>
```

States you'll see:
- `pending` — registered, waiting for epoch.
- `active` — eligible to be selected proposer.
- `unbonding` — signaled unbond, stake locked.

## 5. Monitor

Scrape Prometheus metrics from your node and wire them into Grafana. Key alerts:
- `hermes_validator_online == 0` — node has lost touch with peers.
- `hermes_missed_slots_total` climbing — you're losing stake to liveness slashing.
- `hermes_validator_slashed_total{self}` > 0 — something bad happened.

## 6. Upgrade

Announced via the changelog. Coordinate with other validators on a fork height; upgrade your node before it.

## 7. Exit

```bash
hermes validator unbond
```

Stake remains slashable during the unbond period (100,800 blocks ≈ 9 days). After, funds return to the registered wallet.

## Common pitfalls

- **Running two nodes with the same key** — equivocation, 100% stake slash.
- **Letting the clock drift** — view changes misfire, node may appear offline.
- **Sharing the validator key across services** — keep it isolated.
