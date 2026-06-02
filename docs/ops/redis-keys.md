# Redis Key Reference

| Key | TTL | Purpose |
|---|---|---|
| chain:block_height | none | Latest committed height |
| chain:start_time | none | Genesis timestamp |
| chain:total_transactions | none | Cumulative tx count |
| block:height:N | 300s | Cached block JSON |
| block:hash:H | 300s | Block hash → height index |
| top_accounts:50 | 60s | Cache warmer pre-populates |
| auth:fail:IP | 60s | Failure counter for lockout |
| auth:block:IP | 900s | 15min block window |
| hermes:worker:leader | 30s (renewed 10s) | Leader election lease |
| tokens:daily:DATE | 86400s | Daily token cap |
| ratelimit:KEY | per-route | Sliding window counter |
