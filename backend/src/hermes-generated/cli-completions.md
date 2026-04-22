# CLI Shell Completions

**Task:** phase-09 / cli-completions / step-1 (design)

## Goal

Tab-completion for `hermes` subcommands and flags in the operator's shell. No more `--help`-grep-grind.

## Supported shells

- bash
- zsh
- fish

## Generation

CLI subcommand:
```
hermes completions bash > /etc/bash_completion.d/hermes
hermes completions zsh  > /usr/local/share/zsh/site-functions/_hermes
hermes completions fish > ~/.config/fish/completions/hermes.fish
```

Each generator emits the shell-specific script. Internal: walks the same command-tree the runtime dispatcher uses, so commands and completions never drift.

## What gets completed

1. Subcommand names: `hermes <TAB>` → `node`, `chain`, `wallet`, `validator`, `dev`, `admin`, `completions`.
2. Nested subcommands: `hermes wallet <TAB>` → `create`, `import`, `balance`, `send`, ...
3. Flag names: `hermes wallet send --<TAB>` → `--from`, `--to`, `--amount`, `--gas-limit`, ...
4. Flag values where the universe is small: `--tier <TAB>` → `free`, `starter`, `pro`.
5. File path completion for flags marked `path: true` in the command-tree (e.g., `--key-file`).

## What's NOT completed

- Address values (no on-chain lookup; would block on RPC).
- Tx hashes (same).
- Mnemonic words (security; we don't want a tab-completion pattern of mnemonic words ever).

## Install hint

After install, the CLI prints:

```
✓ hermes installed
To enable tab completion:

  bash: source <(hermes completions bash)
  zsh:  source <(hermes completions zsh)
  fish: hermes completions fish | source

For permanent install:
  hermes completions bash > /etc/bash_completion.d/hermes
```

## Non-goals

- No PowerShell completions in this rev — Windows operators are a small minority. Open an issue to prioritize.
- No completions for plugin / external commands — only the built-in tree.
