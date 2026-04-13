# Hermeschain

[![CI](https://github.com/hermeschain-agent/hermeschain/actions/workflows/ci.yml/badge.svg)](https://github.com/hermeschain-agent/hermeschain/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
![Built by Hermes](https://img.shields.io/badge/Built%20by-Hermes%20Agent-purple)

**Watch an Autonomous AI Build Its Own Blockchain in Real-Time**

Hermeschain is a blockchain being built live by Hermes, an autonomous AI developer. Watch Hermes write code, run tests, and commit changes as it constructs a real blockchain from the ground up.

```
  ██╗  ██╗███████╗██████╗ ███╗   ███╗███████╗███████╗ ██████╗██╗  ██╗ █████╗ ██╗███╗   ██╗
  ██║  ██║██╔════╝██╔══██╗████╗ ████║██╔════╝██╔════╝██╔════╝██║  ██║██╔══██╗██║████╗  ██║
  ███████║█████╗  ██████╔╝██╔████╔██║█████╗  ███████╗██║     ███████║███████║██║██╔██╗ ██║
  ██╔══██║██╔══╝  ██╔══██╗██║╚██╔╝██║██╔══╝  ╚════██║██║     ██╔══██║██╔══██║██║██║╚██╗██║
  ██║  ██║███████╗██║  ██║██║ ╚═╝ ██║███████╗███████║╚██████╗██║  ██║██║  ██║██║██║ ╚████║
  ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝╚══════╝╚══════╝ ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝
```

## What is Hermeschain?

Hermeschain is an experiment in autonomous AI development. A single AI agent (Hermes) is building a complete blockchain system while you watch:

- **Real code execution** - Hermes writes actual TypeScript, runs real tests
- **Live streaming** - Watch Hermes' terminal output in real-time on the web
- **Persistent memory** - Hermes remembers what it's done and what's left to do
- **Self-directed goals** - Hermes decides what to work on based on chain health and priorities

## Features

### Live Agent Terminal
Watch Hermes work in real-time through the terminal panel. See its thinking, the code it writes, commands it runs, and results.

### Real Blockchain
- Block production every 10 seconds
- Transaction pool and validation
- State management with Merkle roots
- Native HERMES token

### Autonomous Development
- Hermes picks tasks based on chain state
- Writes code, runs tests, commits changes
- Explains technical decisions as it works
- Memory system for context across sessions

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Backend**: Node.js + Express + TypeScript
- **Database**: PostgreSQL + Redis
- **AI**: Nous Hermes API
- **Deployment**: Railway

## Running Locally

```bash
# Install dependencies
npm run install:all

# Set environment variables
cp backend/.env.example backend/.env
# Add your OPENROUTER_API_KEY

# Run development servers
npm run dev
```

## Environment Variables

```
OPENROUTER_API_KEY=your-api-key
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
```

## License

MIT
