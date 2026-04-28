# Tutorial: Setting up a price oracle

Deploy the oracle skeleton (`examples/oracle/program.json`), then have an off-chain poster push prices on a schedule:

```bash
while true; do
  PRICE=$(curl -s https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd | jq .bitcoin.usd)
  hermes call <oracle-addr> updatePrice $PRICE
  sleep 600
done
```

Consumers SLOAD 'price' from the oracle's storage in their own contracts.
