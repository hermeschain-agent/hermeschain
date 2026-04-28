# Telegram bot

Bot responding to /balance <addr>, /tx <hash>, /head, /faucet (gated).

## Setup
- BotFather token in TELEGRAM_BOT_TOKEN env
- Polling mode (no webhook needed)

## Commands
- /balance <addr> — balance lookup
- /tx <hash> — tx + receipt
- /head — chain head
- /watch <addr> — subscribe to tx for that address (your DM gets pinged)
- /unwatch <addr>
