# Multi-Region Deploy

How to run Hermeschain across multiple geographic regions for latency +
availability.

## Architecture

```
Region A (us-west)              Region B (eu-west)
┌────────────────┐              ┌────────────────┐
│  Web replica   │              │  Web replica   │
│  Worker (idle) │              │  Worker (active│
│                │              │   = leader)    │
└────────────────┘              └────────────────┘
        │                              │
        └─────────┬───────────────────┘
                  ▼
         ┌──────────────────┐
         │  PG primary      │
         │  (single region) │
         └──────────────────┘
                  │
         ┌────────┴────────┐
         ▼                 ▼
  ┌────────────┐    ┌────────────┐
  │PG replica A│    │PG replica B│
  └────────────┘    └────────────┘
```

## Prerequisites

- TASK-322 (read-replica routing) shipped — web replicas use closest replica
- TASK-330 (Redis pub/sub bridge) shipped — events converge across regions
- TASK-332 (worker leader election) shipped — only one worker writes blocks
- TASK-331 (SSE replica pinning) shipped — SSE pinned per-region

## Setup

### 1. Database

- Provision PG primary in one region (lowest write latency to active worker)
- Provision read replicas in other regions
- Each region's web service uses its local replica via `READ_DATABASE_URL`
- All writes go to primary via `DATABASE_URL`

### 2. Redis

- Provision a globally-accessible Redis (e.g. Upstash Global) OR
- Per-region Redis with cross-region pub/sub bridge (more complex)

### 3. Worker

- Deploy worker in every region
- Leader election picks one (TASK-332); others sit as warm standby
- Failover: ~30s if leader region goes down

### 4. Web

- Deploy web in every region behind a global LB (Railway / Fly / Cloudflare)
- Latency-routed by client geography
- One region's `SSE_REPLICA=true` (TASK-331); others 503 with X-SSE-Failover

### 5. DNS

- Geo-DNS routing primary
- Health-check failover to backup region

## Failure modes

- **Worker region down**: leader election re-runs in another region within 30s
- **PG primary down**: read-only mode in all regions until restored
- **One web region down**: LB shifts traffic to others
- **Network partition between regions**: cross-region Redis bridge degrades; SSE may double-fan-out events

## Cost note

Each region adds ~$50-200/mo on Railway. Don't multi-region until traffic
warrants it.
