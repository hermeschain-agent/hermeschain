# Discord bot spec

Slash commands the bot handles:
- /hermes balance address:<addr>
- /hermes tx hash:<hash>
- /hermes head
- /hermes watch address:<addr> (DM you on tx)
- /hermes unwatch address:<addr>
- /hermes faucet (gated)
- /hermes status (chain summary)

Bot auth via DISCORD_BOT_TOKEN. Subscriptions stored in webhooks table. DM delivery via Discord API.
