# Agent Memory Compaction

**Task:** phase-agent / memory / step-1 (design)

## Problem

`AgentMemory` records every completed task. At 100 commits/day it grows unbounded — by end of year the `completedTasks` list is 36k entries, each with title + agent + completedAt + scope + evidence. Pretty big.

## Compaction strategy

Three tiers:

1. **Hot (< 7 days)**: full record in memory.
2. **Warm (7–90 days)**: summary only — title + completedAt + success/failure bit. Details swapped to disk.
3. **Cold (> 90 days)**: monthly rollup — count + list of scopes touched. Individual tasks dropped.

## When compaction runs

- Background task every 1 hour via setInterval.
- Moves records across tiers based on `completedAt`.
- Emits `[AGENT-MEMORY] compacted N records to warm, M to cold` on completion.

## On-disk warm store

One JSON file per day: `memory/warm/YYYY-MM-DD.json`. Loading is lazy — only parsed when the agent references a specific day via `recall(dayStamp)`.

## Cold rollup format

```json
{
  "month": "2026-02",
  "totalTasks": 2800,
  "successCount": 2714,
  "failureCount": 86,
  "scopes": ["backend/src/blockchain/", "backend/src/api/", "backend/tests/"]
}
```

Rollups produced at warm→cold transition. Individual tasks discarded after.

## Why not just keep everything in memory

At 36k records × ~500 bytes each = 18 MB. Doable in steady state, but the agent can't afford a year-one memory profile that goes up and to the right. Compaction keeps working-set size roughly constant.

## Non-goals

- No external long-term archive — cold rollups are the archive.
- No query across time ranges spanning hot+warm+cold in a single call — the agent rarely needs to.
