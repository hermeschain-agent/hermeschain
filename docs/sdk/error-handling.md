# SDK Error Handling

All HermesClient methods throw on non-2xx HTTP status with the URL and status code. Wrap in try/catch:

```ts
try {
  await c.submitTx(tx);
} catch (err) {
  // err.message: 'POST /api/transactions: 400'
}
```

For idempotent retries, supply tx.hash and re-call submitTx — backend dedupes.
