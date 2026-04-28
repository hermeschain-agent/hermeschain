.PHONY: help install dev build test lint format clean migrate-status backup restore pace-push

help:
	@echo "Hermeschain — common targets"
	@echo "  install         Install backend + frontend deps"
	@echo "  dev             Start backend (ts-node-dev)"
	@echo "  build           Build backend"
	@echo "  test            Build + run unit tests"
	@echo "  lint            Run prettier --check"
	@echo "  format          Run prettier --write"
	@echo "  clean           Remove backend/dist + frontend/dist"
	@echo "  migrate-status  Show applied + pending migrations"
	@echo "  backup          Run pg_dump → S3 (needs AWS env)"
	@echo "  restore         Restore latest backup → RESTORE_DATABASE_URL"
	@echo "  pace-push       Push next commit on tier-3-backlog → main"

install:
	cd backend && npm install
	cd frontend && npm install

dev:
	cd backend && npm run dev

build:
	cd backend && npm run build

test:
	cd backend && npm test

lint:
	npx prettier --check .

format:
	npx prettier --write .

clean:
	rm -rf backend/dist frontend/dist

migrate-status:
	cd backend && npm run migrate:status

backup:
	cd backend && npm run backup

restore:
	cd backend && npm run restore -- --latest

pace-push:
	cd backend && npm run pace:push
