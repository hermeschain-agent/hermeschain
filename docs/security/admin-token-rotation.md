# Admin Token Rotation

Procedure for rotating `ADMIN_TOKEN` env var without downtime.

## When to rotate

- Suspected leak (token in a paste, public log, etc.) — IMMEDIATELY
- Quarterly hygiene rotation
- Departure of a maintainer who knew the token

## Procedure

### Zero-downtime rotation

1. **Generate the new token**
   ```
   openssl rand -hex 32
   ```

2. **Stage both via secondary env**
   - Set `ADMIN_TOKEN_SECONDARY` = new token
   - Keep `ADMIN_TOKEN` = old token
   - Deploy. The auth middleware accepts either.

3. **Migrate clients**
   - Update any tooling, scripts, CI vars to use the new token
   - Verify each is using the new value (audit log will show)

4. **Promote the new value**
   - `ADMIN_TOKEN` = new token
   - Remove `ADMIN_TOKEN_SECONDARY`
   - Deploy. Old token now invalid.

### Emergency rotation (suspected leak)

Skip the staging period. Rotate `ADMIN_TOKEN` immediately and accept brief
disruption while clients update.

## Post-rotation

- Add an entry to the audit log noting the rotation reason
- Sweep recent `api_key_audit` for any creations using the old token; revoke if suspect
- If leak was due to a code path, file TASK-NNN to fix

## Verification

After rotation:
```
curl -X POST https://hermeschain.io/api/auth/keys \
  -H "X-Admin-Token: <new-token>" \
  -d '{"label":"rotation-test"}'
# expect 200

curl -X POST https://hermeschain.io/api/auth/keys \
  -H "X-Admin-Token: <old-token>" \
  -d '{"label":"should-fail"}'
# expect 403
```

Delete the test key right after.
