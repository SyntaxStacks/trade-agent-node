# Trade Agent Node

A simple trade signal bot using Node.js and Discord alerts.

## Setup
1. Copy `.env.example` → `.env`
1. Add your Discord bot webhook:
`DISCORD_WEBHOOK_URL=<add webhook here>`
1. Add your Alpha Vantage key:
`ALPHA_VANTAGE_API_KEY=your_key_here`
1. Run locally: `npm install && node run.js`
1. Use GitHub Actions to automate alerts every hour

## Crypto Signal Integration

Uses CoinGecko to fetch hourly BTC/ETH prices and compute RSI. Sends Discord alerts when RSI < 30.

