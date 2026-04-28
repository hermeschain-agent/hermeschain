# Wallet: send

POST /api/wallet/send with signed payload. Server verifies signature against from.publicKey, checks nonce + balance, submits to mempool.
