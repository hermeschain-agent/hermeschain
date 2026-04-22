# Contract ABI Format

**Task:** phase-09 / contract-abi / step-1 (design)

## Why an ABI

The explorer needs to decode contract input data into named fields ("transfer(to=0x..., amount=100)" instead of "0xa9059cbb..."). Wallets need ABIs to show users what they're signing. Indexers need ABIs to map log topics to event names.

## Format

JSON, modeled on Ethereum's ABI v2:

```json
[
  {
    "type": "function",
    "name": "transfer",
    "stateMutability": "nonpayable",
    "inputs": [
      { "name": "to", "type": "address" },
      { "name": "amount", "type": "uint256" }
    ],
    "outputs": [{ "name": "", "type": "bool" }],
    "selector": "0xa9059cbb"
  },
  {
    "type": "event",
    "name": "Transfer",
    "anonymous": false,
    "inputs": [
      { "name": "from", "type": "address", "indexed": true },
      { "name": "to", "type": "address", "indexed": true },
      { "name": "amount", "type": "uint256", "indexed": false }
    ],
    "topic0": "0xddf252ad..."
  }
]
```

## Selector / topic computation

Selector for `transfer(address,uint256)` = first 4 bytes of `keccak256("transfer(address,uint256)")`. Topic0 for the `Transfer` event = full 32-byte hash of the same canonical signature.

## Type system

Match Ethereum's: `address`, `bool`, `uint8`-`uint256`, `int8`-`int256`, `bytesN`, `string`, `bytes`, plus arrays and tuples.

## Submission

`POST /api/abi/submit` with `{address, abi}`. Anyone can submit; the indexer keeps the most-frequently-queried entry per address. A future "verified deploy" workstream lets a deployer sign their submission for first-class trust.

## Storage

```sql
CREATE TABLE contract_abis (
  address     TEXT NOT NULL,
  source      TEXT NOT NULL,  -- 'submitted' | 'verified-deploy'
  abi_json    TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (address, source)
);
```

## Non-goals

- No automated source-code verification (would require a Solidity-compatible compiler + reproducible builds — separate workstream).
- No NatSpec / docstring extraction in this rev.
