# Key rotation playbook

## API keys
- Cli mints new key with same scope: `POST /auth/keys/:id/rotate`
- Old key valid for 24h grace period
- Audit trail in api_key_audit (action=rotated)

## Admin token
- Set ADMIN_TOKEN_SECONDARY to new value
- Deploy
- Once clients migrated, promote secondary → primary
- Remove secondary, deploy

## Validator key
- Slashing prevents accidental rotation; coordinate via consensus_events
- New key registers via POST /api/validators with prior key's signature
