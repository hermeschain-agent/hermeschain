# Runbook: Agent worker stuck

## Symptoms

- HUD shows no new tool calls in last hour
- `/api/agent/stream` SSE quiet (only heartbeats)
- Recent commits all from the same time window
- `agent_tasks` rows stuck in `status='in_progress'`

## Diagnosis

1. Check Railway worker logs: `railway logs -s hermeschain-worker`
2. Look for `[LEADER]` lines — is this replica leader (TASK-332)?
3. Check Anthropic API key: `curl /api/config/status | jq .llmConfigured`
4. Check token budget: are we at the daily cap (TASK-187)?
5. Check for a runaway task: any task running >30 min?

## Mitigation

### If at API key issue

- Verify `ANTHROPIC_API_KEY` env on the worker service
- Check Anthropic console for rate limits or billing issues

### If task stuck

- Stuck-task recovery (TASK-333) should auto-reset after 1h. Force it:
  ```sql
  UPDATE agent_tasks SET status='pending' WHERE id='<task-id>';
  ```
- If recurring on same task, mark abandoned:
  ```sql
  UPDATE agent_tasks SET status='abandoned' WHERE id='<task-id>';
  ```

### If leader election broken

- Check Redis: `redis-cli -u $REDIS_URL get hermes:worker:leader`
- If stale value: `redis-cli del hermes:worker:leader` and the next worker poll will acquire

### Last resort

- Restart the worker service via Railway dashboard

## Escalation

If stuck >2h with no resolution: file a TASK-NNN entry in the backlog and
note in #incidents.
