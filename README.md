# Trade Agent Node

A fully automated trading assistant with:
- RSI & breakout scanning for **stocks** (via Alpha Vantage) and **crypto** (via CoinGecko)
- Real-time **Discord bot commands** for managing watchlists, trades, and settings
- Persistent **Supabase backend** (trades, watchlists, settings)
- Hosted on **Render** as a single background worker

---

## **Features**

- **Hourly scans** (configurable) with alerts via Discord webhook
- Track open/closed trades in Supabase
- Manage watchlists directly from Discord (`!addcoin`, `!removestock`, etc.)
- Change bot behavior live using settings commands (no redeploy required)
- Manual `!scan` command to trigger scans on demand
- Detailed `!summary` reports for daily trade activity

---

## **Setup**

### 1. Clone and Install
```bash
git clone https://github.com/SyntaxStacks/trade-agent-node.git
cd trade-agent-node
npm install
```

### 2. Create a Discord Bot
1. Go to [https://discord.com/developers/applications](https://discord.com/developers/applications)
2. Create an application → add a **Bot**
3. Enable `MESSAGE CONTENT INTENT`
4. Copy your **Bot Token** and set it in `.env`

Invite the bot:
- In OAuth2 > URL Generator, select:
  - **Scopes**: `bot`, `applications.commands`
  - **Permissions**: `Send Messages`, `Read Message History`
- Paste the URL in your browser and authorize the bot to your server

### 3. Create Supabase Project
- [https://supabase.com](https://supabase.com) → New Project
- Copy **API URL** and **service_role key**
- Run the following SQL in **Supabase → SQL Editor**:
```sql
create extension if not exists "uuid-ossp";

create table if not exists settings (
  key text primary key,
  value text not null,
  updated_at timestamptz default now()
);

create table if not exists watchlist (
  id uuid primary key default uuid_generate_v4(),
  type text not null check (type in ('crypto','stock')),
  cid text,
  symbol text not null,
  created_at timestamptz default now()
);

create table if not exists trades (
  id uuid primary key default uuid_generate_v4(),
  data jsonb not null,
  created_at timestamptz default now()
);

create unique index if not exists uniq_watchlist
  on watchlist (type, lower(coalesce(cid,'')), upper(symbol));
```

### 4. Environment Variables
Create `.env` (or set in Render):
```bash
DISCORD_BOT_TOKEN=xxx
DISCORD_WEBHOOK_URL=xxx
SUPABASE_URL=xxx
SUPABASE_KEY=xxx
ALPHA_VANTAGE_API_KEY=xxx

# Optional: restrict commands to specific Discord user IDs
OWNER_IDS=123456789,987654321
```

---

## **Usage**

### **Discord Commands**

### 📊 Trade Management
- `!summary` → shows open/closed trades since today (PT)
- `!summary 2` → last 2 days
- `!summary utc` → UTC day
- `!close <SYMBOL> [TYPE] [NOTE]` → close open trades  
  e.g. `!close SOXL BREAKOUT Took profit +12%`

### 🪙 Watchlists
- `!addcoin <coingecko-id> [SYMBOL]`  
  e.g. `!addcoin bitcoin BTC`
- `!removecoin <coingecko-id>`  
  e.g. `!removecoin bitcoin`
- `!listcoins` → list crypto watchlist

- `!addstock <SYMBOL>`  
  e.g. `!addstock SOXL`
- `!removestock <SYMBOL>`  
  e.g. `!removestock SOXL`
- `!liststocks` → list stock watchlist

### ⚙️ Settings (persisted in Supabase)
- `!set <KEY> <VALUE>`  
  e.g. `!set RSI_PERIOD 14`  
  e.g. `!set BREAKOUT_THRESHOLD 2`  
  e.g. `!set SCAN_INTERVAL_MINUTES 60`
- `!get <KEY>` → show a single setting  
- `!settings` → list all settings

### ⏱️ Scan Control
- `!scan` → run a scan immediately (instead of waiting for the next scheduled scan)

---

## **Render Deployment**

1. Push this repo to GitHub
2. Create a **Background Worker** on [Render](https://render.com)
3. Link your GitHub repo
4. Start Command:  
   ```bash
   npm start
   ```
5. Add the same env vars as above to Render's **Environment Variables** panel

---

## **Extending**

- Add auto-close rules, alert cooldowns, or advanced analytics by editing:
  - `src/orchestrator.js` → scan scheduling & settings application
  - `src/scanner.js` / `src/cryptoScanner.js` → trade logic
- Commands live in `src/commands.js`
- Settings, watchlists, and trades are all persisted in Supabase

---

## **Example: Daily Workflow**

1. Add a stock or coin to watch:
   ```
   !addstock NVDA
   !addcoin solana SOL
   ```

2. Trigger a scan immediately:
   ```
   !scan
   ```

3. Review daily summary:
   ```
   !summary
   ```

4. Close positions when needed:
   ```
   !close BTC RSI Took 10% gain
   ```

---
