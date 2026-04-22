# Guide: Deploy a Contract

**Task:** phase-10 / guide / step-2 (docs)

## What you need

- A wallet with enough HRM to cover deployment gas (~0.05 HRM for a typical contract).
- The contract bytecode (from a compiler like `solc` targeting Hermeschain's bytecode, or hand-written).
- A constructor payload if the contract takes init args.

## Step 1: Prepare the init code

The init code = `bytecode || abi.encode(constructor_args)`.

If your contract has no constructor args, init code = bytecode alone.

```bash
hermes dev abi encode \
  --types 'uint256,string' \
  --values '1000,HermesToken' \
  > args.hex

cat bytecode.hex args.hex | tr -d '\n' > initcode.hex
```

## Step 2: Estimate gas

```bash
hermes wallet estimate-deploy \
  --init-code $(cat initcode.hex)
```

Returns a gas estimate. Add ~20% buffer.

## Step 3: Deploy

```bash
hermes wallet deploy \
  --init-code $(cat initcode.hex) \
  --gas-limit 500000 \
  --max-fee 10 \
  --max-priority-fee 2
```

Output:
```
Deployment tx: 0xabc...
Expected contract address: 0xdef...
Waiting for confirmation...
Included in block 382,921
Finalized: 0xdef... (size: 3,421 bytes)
```

## Step 4: Verify the deploy

```bash
hermes chain tx <hash>
```

Confirm:
- `status: success`
- `contractAddress` matches what you expected.

## Step 5: Upload ABI (optional but recommended)

```bash
hermes abi submit \
  --address 0xdef... \
  --abi-file contract.abi.json
```

Makes the explorer + SDK able to decode calls to your contract.

## Step 6: Interact

```bash
hermes wallet call 0xdef... transfer \
  --types 'address,uint256' \
  --values '0x111...,100'
```

Signs + submits a call tx. The CLI uses the ABI you uploaded to encode + display the call.

## Common pitfalls

- **Init code reverts** — constructor failed, no contract deployed. Gas is still spent. Check the revert reason in the receipt.
- **Address collision with CREATE2** — if someone deployed the same bytecode+salt combo before you, deploy reverts with `CONTRACT_ALREADY_EXISTS`. Use a different salt.
- **Skipping ABI upload** — explorer shows raw hex. Readability drops sharply.
