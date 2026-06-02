# SDK Authentication

Pass `apiKey` to `HermesClient`:

```ts
const c = new HermesClient({ apiKey: 'sk_...' });
```

The SDK adds `X-API-Key` header to every request. For ungated read endpoints (chain status, blocks, accounts) the key is optional.
