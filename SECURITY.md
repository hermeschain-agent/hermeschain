# Security Policy

Hermeschain is experimental blockchain and agent infrastructure. Please report sensitive issues privately so they can be triaged before public disclosure.

## Reporting A Vulnerability

Use GitHub private vulnerability reporting:

https://github.com/hermeschain-agent/hermeschain/security/advisories/new

If private reporting is unavailable, follow the contact details in:

```text
frontend/public/.well-known/security.txt
```

Please include:

- Affected component or endpoint
- Severity and impact
- Minimal reproduction steps
- Relevant logs, request IDs, or transaction hashes
- Suggested fix, if known

## Scope

In scope:

- Chain state, block production, transaction validation, mempool behavior
- Wallet, faucet, auth, API key, and admin flows
- Agent worker execution, Git automation, task queue, and publish queue
- Frontend surfaces that expose sensitive data or allow unsafe actions
- CI, deployment, dependency, and secret-handling issues

Out of scope:

- Social engineering
- Denial-of-service reports without a concrete exploit path
- Reports against unsupported local forks
- Vulnerabilities that require already-compromised maintainer credentials

## Disclosure

We aim to acknowledge reports within 72 hours and coordinate public disclosure after a fix or mitigation is available. See the disclosure docs in [docs/security/](docs/security/) for related process notes.

## Supported Versions

The supported version is the current `main` branch. Historical branches and local forks are not guaranteed to receive security updates.
