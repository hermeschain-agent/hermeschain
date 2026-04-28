# Runbook: Anthropic API quota exhausted

## Symptoms
- [HERMES] usage logs spike
- Agent worker tasks stalling on hermesChat
- /api/agent/stream silent

## Mitigation
- Set lower HERMES_MAX_TOKENS_PER_TASK
- Switch to claude-haiku-4-5 if currently on Sonnet
- Pause agent worker via PACED_PUSH_ENABLED=false
