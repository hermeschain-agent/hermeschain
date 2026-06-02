# Protocol upgrade process

1. CIP approved
2. Maintainer ships code via PR (or autonomous agent does)
3. CHANGELOG updated
4. New release tag (v0.X)
5. Migration auto-applies on Railway redeploy
6. Backwards-compat preserved for 1 minor version
7. Old endpoints deprecated with Deprecation header

Breaking changes require coordinated 2-week notice + version bump (v0 → v1).
