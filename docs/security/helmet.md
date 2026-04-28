# Helmet headers (TASK-337)

| Header | Value | Purpose |
|---|---|---|
| Strict-Transport-Security | max-age=31536000; includeSubDomains | Force HTTPS for 1 year |
| X-Frame-Options | DENY | Block iframe embedding |
| X-Content-Type-Options | nosniff | MIME sniffing defense |
| Referrer-Policy | strict-origin-when-cross-origin | Limit referrer leak |
| Content-Security-Policy | per-route | Per-page CSP
