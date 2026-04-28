_default:
    @just --list

# Install backend + frontend deps
install:
    cd backend && npm install
    cd frontend && npm install

# Start backend (ts-node-dev)
dev:
    cd backend && npm run dev

# Build backend
build:
    cd backend && npm run build

# Run unit tests
test:
    cd backend && npm test

# Lint via prettier --check
lint:
    npx prettier --check .

# Format via prettier --write
format:
    npx prettier --write .

# Remove backend/dist + frontend/dist
clean:
    rm -rf backend/dist frontend/dist

# Show applied + pending migrations
migrate-status:
    cd backend && npm run migrate:status

# Run pg_dump → S3 (needs AWS env)
backup:
    cd backend && npm run backup

# Restore latest backup → RESTORE_DATABASE_URL
restore:
    cd backend && npm run restore -- --latest

# Push next commit on tier-3-backlog → main
pace-push:
    cd backend && npm run pace:push
