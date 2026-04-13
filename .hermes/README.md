# .hermes/ — Autonomous Agent Configuration

This directory contains the task schedule and configuration for the Hermes autonomous agent that builds and maintains Hermeschain.

## Files

| File | Purpose |
|------|---------|
| `tasklist.yml` | 106-hour development schedule with phased commits |

## How It Works

Hermes reads `tasklist.yml` to determine what to work on next. Each task includes:
- **hour**: offset from the sprint start time
- **type**: conventional commit type (feat, fix, test, docs, refactor, perf, chore, ci)
- **scope**: module being modified (chain, agent, api, frontend, contracts, etc.)
- **message**: the commit message Hermes will use
- **description**: what the task actually involves
- **files**: which files are expected to change

### Sleep Windows

Hermes operates in 16-hour active cycles with 8-hour cooldown windows for maintenance and state consolidation. During sleep windows, no commits are produced.

### Commit Style

All commits follow [Conventional Commits](https://www.conventionalcommits.org/):
```
type(scope): short description

Optional longer explanation of what changed and why.
```

## Sprint Status

- **Start**: 2026-04-13T00:00:00Z
- **End**: 2026-04-17T10:00:00Z
- **Duration**: 106 hours
- **Active Hours**: ~70
- **Target Commits**: ~106
