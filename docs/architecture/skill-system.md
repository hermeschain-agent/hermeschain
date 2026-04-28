# Skill system

Skills are pluggable code that the agent can invoke via tool calls. Each skill:
- Has a unique ID + version (TASK-191/192)
- Has optional rate limit per minute (TASK-193)
- Logs invocations to ci_results / agent_tools log

## Built-in skills
- file_io: read/write files
- bash: shell commands
- git: git ops
- npm: npm script invocation
- http: HTTP fetch
- browser: headless browser (Playwright-style)
