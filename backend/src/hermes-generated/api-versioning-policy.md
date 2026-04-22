# API Versioning Policy

**Task:** phase-07 / api-versioning / step-1 (policy)

## Principles

1. **Stable versions don't break.** Once `/api/v1/*` ships, any change must be backward-compatible within v1.
2. **Deprecate before remove.** Add the replacement, emit a `Deprecation: true` response header on the old route for at least one release cycle, then remove.
3. **Minor bumps are additive only.** New fields, new endpoints — never remove or retype.
4. **Major bumps introduce `/api/v2/*`** and run alongside v1 for a transition window (minimum 6 months).

## What's "breaking"

Examples that require a major bump:
- Removing a field.
- Changing a field's type (e.g., `number` → `string`).
- Changing the semantics of a field without changing its name.
- Reordering an enum.

Examples that are additive (minor bump):
- Adding a new field.
- Adding a new optional query parameter.
- Accepting a new value in a discriminated union.
- Adding a new endpoint.

## Response headers

Every response carries:
- `X-API-Version: v1.4.0` (semver of the API, separate from the chain version).
- `Deprecation: true` when the route is scheduled for removal.
- `Sunset: Sat, 01 Jun 2026 00:00:00 GMT` when removal date is set.

## Client expectations

SDK clients should:
- Honor 404 on a route as "endpoint removed"; fall back to the documented replacement.
- Parse leniently: unknown fields in a response are ignored, not rejected.
- Surface `Deprecation` headers via a one-time console warning so upstream devs notice.

## Non-goals

- No content negotiation for field names (`Accept: application/hermes.v1+json` etc.). URL-based versioning is simpler.
- No GraphQL / gRPC paths — REST with JSON is the default and only flavor.
