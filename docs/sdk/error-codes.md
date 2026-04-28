# SDK error codes

| HTTP | Error | When |
|---|---|---|
| 400 | bad-request | malformed body |
| 401 | unauthorized | bad sig / missing key |
| 403 | forbidden | insufficient scope / admin gate |
| 404 | not-found | unknown tx/block/account |
| 409 | conflict | replay / nonce mismatch / parent unknown |
| 413 | payload-too-large | body > JSON_BODY_LIMIT |
| 429 | rate-limited | check X-RateLimit-Reset |
| 503 | unavailable | shutdown / health failing |
