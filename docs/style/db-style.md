# DB query style

- Always parameterized ($1, $2, …) — never string interpolation
- Use ON CONFLICT DO UPDATE for idempotent inserts
- Read paths via db.queryRead when read-replica routing is enabled
- Migrations: never edit applied — write a new one
- One concept per migration; small files preferred
