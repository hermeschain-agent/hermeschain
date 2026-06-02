-- Common query: top-accounts
SELECT address, balance, nonce FROM accounts ORDER BY balance::numeric DESC LIMIT 100;
