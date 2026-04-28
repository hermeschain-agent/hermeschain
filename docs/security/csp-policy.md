# Content Security Policy

`script-src 'self' 'nonce-XYZ' https://cdn.sentry-cdn.com;`

Per-request nonce mapped to res.locals.cspNonce. Inline scripts must carry the nonce attribute. Frame ancestors none.
