# CSRF protection (TASK-336)

Double-submit cookie pattern: server sets `csrf-token` cookie + expects matching `X-CSRF-Token` header on POST/PUT/DELETE. API-key authenticated routes exempt (token-based already).
