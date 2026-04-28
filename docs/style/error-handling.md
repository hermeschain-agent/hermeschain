# Error handling

- Throw native Error subclasses with descriptive messages
- API handlers wrap in try/catch and return JSON {error: msg, code: number}
- Background jobs catch + log + continue (don't crash worker)
- Never swallow errors silently
- Use captureException (Sentry) for uncaught
