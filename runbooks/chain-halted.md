# Runbook: Chain halted

## Symptoms

- `/api/status` chainLength not incrementing for >2 minutes
- HUD block height frozen
- BlockProducer logs `consecutive failures` count rising
- `consensus_failed` events streaming

## Diagnosis

1. Check `/api/metrics | grep hermes_chain_height` — actually frozen?
2. Tail BlockProducer logs: `[PRODUCER] Block #N` cadence
3. Check `proofOfAI.validateBlock` rejection reasons
4. Quorum failing? Inspect `consensus_events` table: `SELECT * FROM consensus_events ORDER BY created_at DESC LIMIT 20`
5. Validator manager state: `curl /api/validators | jq '.[].active'`

## Mitigation

### Producer can't sign

- Check Hermes private key env / signing config
- Restart worker to reset BlockProducer state

### AI validation always rejecting

- Check Anthropic API health (proofOfAI uses LLM for validation)
- Temporarily disable AI validation via env (if available) and produce naively

### Quorum can't reach 2/3

- Check validator stake allocations: `SELECT address, stake FROM validators WHERE active`
- If single validator, threshold is 1; should never fail unless self-validation throws
- Force-add a fallback validator (out-of-band SQL)

### Last resort

- Restart worker and observe whether production resumes

## Escalation

If halted >5 min: post to #incidents with chain head + last successful block.
This is a tier-1 production incident.
