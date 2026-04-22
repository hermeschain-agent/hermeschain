# Docs Site Structure

**Task:** phase-10 / docs-site / step-1 (design)

## Stack

- MDX-based, built with Vite in the same monorepo under `docs/`.
- Deployed to `docs.hermeschain.xyz` via Railway.
- Content in `.mdx` files; code samples auto-imported from `sdk/examples/`.

## Information architecture

```
Getting Started
  Install the CLI
  Run a local node
  Your first transaction

Concepts
  Accounts and keys
  Blocks and finality
  Validators and staking
  Fee market
  Transaction lifecycle

Guides
  Building a wallet
  Deploying a contract
  Running a validator
  Monitoring a node

Reference
  HTTP RPC
  WebSocket subscriptions
  TypeScript SDK
  CLI commands
  Error codes
  Config reference

Protocol
  Consensus
  State model
  Fork choice
  Slashing
  Checkpoints
  Weak subjectivity

Operations
  Incident response
  Secret rotation
  Upgrade procedure
  Benchmarks

Changelog
```

## Writing conventions

- One topic per page. Long topics split into numbered sub-pages.
- Code blocks live in separate files under `examples/`, imported via `<CodeBlock src="..."/>` so they stay compilable.
- Concepts pages end with "Related references" linking to the protocol section.
- Every HTTP endpoint in the Reference section follows the same template: summary, path, params, response shape, errors, example.

## Versioning

Docs track the latest stable API version (`v1`). A banner on every page links to the "upcoming v2" docs if applicable.

## Search

Algolia DocSearch (free tier for open-source). Index rebuilds on every deploy.

## Non-goals

- No interactive playground — defer to the CLI + docker-compose for hands-on.
- No translated docs — English only.
- No commenting system (GitHub Discussions is the feedback channel).
