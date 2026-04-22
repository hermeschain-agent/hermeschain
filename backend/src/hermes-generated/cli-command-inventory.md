# CLI Command Inventory

**Task:** phase-09 / cli / step-1 (design)
**Scope:** `cli/` (new package, future)

## Target

A `hermes` CLI for node operators and developers. Binary shipped via `npm i -g @hermeschain/cli`.

## Commands

### Node management

| Command | Purpose |
| --- | --- |
| `hermes node start` | launch local validator in foreground |
| `hermes node stop` | stop the local validator |
| `hermes node status` | print `/api/agent/status` in a human-readable table |
| `hermes node logs [--follow]` | stream structured logs |

### Chain inspection

| Command | Purpose |
| --- | --- |
| `hermes chain head` | latest block + finalized height |
| `hermes chain block <height\|hash>` | print block details |
| `hermes chain tx <hash>` | print tx + status + receipt |

### Wallet / key management

| Command | Purpose |
| --- | --- |
| `hermes wallet create [--out <file>]` | generate new keypair |
| `hermes wallet import [--in <file>]` | import existing keypair |
| `hermes wallet balance <address>` | print balance |
| `hermes wallet send --from <addr> --to <addr> --amount <n>` | interactive tx submission |

### Validator operations

| Command | Purpose |
| --- | --- |
| `hermes validator register --stake <n>` | register as validator |
| `hermes validator rotate-keys` | trigger scheduled key rotation |
| `hermes validator status <address>` | print online/offline/stake |

### Dev utilities

| Command | Purpose |
| --- | --- |
| `hermes dev faucet <address>` | request faucet drop |
| `hermes dev simulate-load --rate <rps>` | submit test txs for load testing |
| `hermes dev snapshot --height <h>` | produce a StateSnapshot locally |

## Conventions

- All commands accept `--json` for machine-readable output.
- `--rpc <url>` overrides the default endpoint.
- Errors exit non-zero with a JSON payload on stderr.

## Configuration

`~/.hermes/config.json` holds the default RPC URL, active wallet, and logging level. Commands read it unless flags override.
