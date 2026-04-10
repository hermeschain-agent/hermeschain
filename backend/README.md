# Hermeschain Backend

Real blockchain backend with 6 AI validators producing blocks every 10 seconds.

## Quick Start

### 1. Setup PostgreSQL

**Option A: Docker (Recommended)**
```bash
docker-compose up -d postgres
```

**Option B: Local PostgreSQL**
```bash
# Install PostgreSQL 15+
# Create database
createdb hermeschain
createuser hermeschain -P  # Password: changeme
psql -c "GRANT ALL PRIVILEGES ON DATABASE hermeschain TO hermeschain;"
```

### 2. Configure Environment

```bash
cd backend
cp .env.example .env
# Edit .env with your database URL
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Start Backend

```bash
npm run dev
```

You should see:
```
🏛️  Starting Hermeschain Backend...

✅ Database connected

🤖 Initializing AI validators...
   ✓ † MOLT initialized
   ✓ ! GROK initialized
   ✓ * GPT initialized
   ✓ ■ STABLE initialized
   ✓ ? PERPLEX initialized
   ✓ ○ COHERE initialized
✅ 6 validators active

✅ Server running on http://localhost:4000

🔨 Block production started - 10 second intervals

🔨 Producing block #1 [MOLT]
   📦 Including 0 transactions
   🗳️  Requesting consensus from validators...
      ! GROK: ✓ APPROVE
      * GPT: ✓ APPROVE
      ■ STABLE: ✓ APPROVE
      ? PERPLEX: ✓ APPROVE
      ○ COHERE: ✓ APPROVE
   ✅ Consensus: 5/6 (need 4)
✅ Block #1 added to chain
```

## API Endpoints

### Status
```
GET /api/status
```

### Blocks
```
GET /api/blocks
GET /api/blocks/:height
```

### Validators
```
GET /api/validators
```

### Transactions
```
POST /api/transactions
Body: { from, to, value, gasPrice, gasLimit, nonce, signature }
```

### Chat with Validator
```
POST /api/chat/:validator
Body: { message }
```

## Database Schema

The backend automatically creates these tables:
- `blocks` - Blockchain blocks
- `transactions` - Transaction history
- `accounts` - Account balances
- `validators` - AI validator info
- `aips` - Improvement proposals
- `aip_votes` - Voting records
- `debate_messages` - Debate history
- `chat_logs` - Chat history
- `consensus_events` - Consensus events
- `validator_relationships` - Validator agreement rates

## Architecture

```
Backend
├── src/
│   ├── api/          # REST API endpoints
│   ├── blockchain/   # Core blockchain (Block, Chain, TransactionPool, BlockProducer)
│   ├── validators/   # AI validators (Hermes)
│   ├── aip/          # CIP governance
│   ├── database/     # Database layer
│   ├── events/       # Event system
│   └── utils/        # Utilities
```

## Block Production

Every 10 seconds:
1. Select validator (round-robin)
2. Gather pending transactions
3. Create new block
4. Validator validates
5. Get consensus from other validators (66% quorum)
6. Add to blockchain
7. Broadcast event

## Next Steps

- [ ] Add WebSocket support for real-time events
- [ ] Implement CIP debate system
- [ ] Add transaction signing validation
- [ ] Implement state management
- [ ] Add fork resolution
- [ ] Connect to real AI APIs (currently using placeholders)

