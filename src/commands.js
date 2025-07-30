// src/commands.js
require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const {
  closeTrade,
  fetchTrades,
  fetchTradesSince,
  summarizeTrades,
  addCryptoToWatchlist,
  removeCryptoFromWatchlist,
  listCryptoWatchlist,
  addStockToWatchlist,
  removeStockFromWatchlist,
  listStockWatchlist,
  setSetting,
  getSetting,
  getAllSettings,
} = require('./supabaseLogger');
const { runScanOnce } = require('./orchestrator');

const OWNER_IDS = (process.env.OWNER_IDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function isAuthorized(userId) {
  if (OWNER_IDS.length === 0) return true; // open if not configured
  return OWNER_IDS.includes(String(userId));
}

function formatSummary(tz, sinceIso, openSummary, closedSummary) {
  const fmtMap = (m) =>
    Object.entries(m)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ') || '—';

  return (
    `📊 **Summary** (${tz}, since ${sinceIso})\n` +
    `• Open trades: **${openSummary.total}**\n` +
    `  • by type: ${fmtMap(openSummary.byType)}\n` +
    `  • by symbol: ${fmtMap(openSummary.bySymbol)}\n` +
    `• Closed trades: **${closedSummary.total}**\n` +
    `  • by type: ${fmtMap(closedSummary.byType)}\n` +
    `  • by symbol: ${fmtMap(closedSummary.bySymbol)}`
  );
}

function computeSinceIso(daysArg, tz) {
  const now = new Date();
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const partsNow = dtf.formatToParts(now);
  const get = (type) => partsNow.find((p) => p.type === type)?.value;
  const month = get('month');
  const day = get('day');
  const year = get('year');

  const localMidnightStr = `${year}-${month}-${day}T00:00:00`;
  const tzMidnight = new Date(
    new Date(localMidnightStr).toLocaleString('en-US', { timeZone: tz })
  );
  let sinceIso = new Date(
    Date.UTC(
      tzMidnight.getUTCFullYear(),
      tzMidnight.getUTCMonth(),
      tzMidnight.getUTCDate(),
      tzMidnight.getUTCHours(),
      tzMidnight.getUTCMinutes(),
      tzMidnight.getUTCSeconds()
    )
  ).toISOString();

  if (daysArg > 1) {
    const back = new Date(new Date(sinceIso).getTime() - (daysArg - 1) * 24 * 60 * 60 * 1000);
    sinceIso = back.toISOString();
  }
  return sinceIso;
}

function startDiscordBot() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.on('ready', () => {
    console.log(`🤖 Discord bot logged in as ${client.user.tag}`);
  });

  client.on('messageCreate', async (msg) => {
    const content = (msg.content || '').trim();
    if (!content || msg.author.bot) return;

    try {
      // -----------------------
      // TRADE MGMT COMMANDS
      // -----------------------
      if (content.startsWith('!close')) {
        if (!isAuthorized(msg.author.id)) return msg.reply('⛔ Not authorized.');
        const parts = content.split(/\s+/);
        const [, symbol, type = 'RSI', ...noteParts] = parts;
        const note = noteParts.join(' ');
        if (!symbol) return msg.reply('⚠️ Usage: `!close SYMBOL [TYPE] [NOTE]`');

        await closeTrade(symbol.toUpperCase(), type.toUpperCase(), note);
        return msg.reply(
          `✅ Closed **${symbol.toUpperCase()}** (${type.toUpperCase()})\n📝 ${note || 'No note provided'}`
        );
      }

      if (content.startsWith('!summary')) {
        const parts = content.split(/\s+/);
        const maybeDays = parts[1] || '';
        const maybeTz = (parts[2] || parts[1] || '').toLowerCase();
        const useUtc = maybeTz === 'utc';

        const daysArg = Number.isNaN(+maybeDays) ? 1 : Math.max(1, Math.min(7, +maybeDays));
        const tz = useUtc ? 'UTC' : 'America/Los_Angeles';
        const sinceIso = computeSinceIso(daysArg, tz);

        const openTrades = await fetchTrades({ 'data->>status': 'eq.OPEN' });
        const closedSince = await fetchTradesSince(sinceIso, { 'data->>status': 'eq.CLOSED' });
        const openSummary = summarizeTrades(openTrades);
        const closedSummary = summarizeTrades(closedSince);

        return msg.reply(formatSummary(tz, sinceIso, openSummary, closedSummary));
      }

      // -----------------------
      // WATCHLIST COMMANDS
      // -----------------------
      if (content.startsWith('!addcoin')) {
        if (!isAuthorized(msg.author.id)) return msg.reply('⛔ Not authorized.');
        const parts = content.split(/\s+/);
        const [, coinId, providedSymbol] = parts;
        if (!coinId) return msg.reply('⚠️ Usage: `!addcoin <coingecko-id> [SYMBOL]`');
        const symbol = (providedSymbol || guessSymbolFromId(coinId)).toUpperCase();
        await addCryptoToWatchlist(coinId, symbol);
        return msg.reply(`✅ Added coin **${symbol}** (id: ${coinId}) to watchlist.`);
      }

      if (content.startsWith('!removecoin')) {
        if (!isAuthorized(msg.author.id)) return msg.reply('⛔ Not authorized.');
        const parts = content.split(/\s+/);
        const [, coinId] = parts;
        if (!coinId) return msg.reply('⚠️ Usage: `!removecoin <coingecko-id>`');
        const count = await removeCryptoFromWatchlist(coinId);
        return msg.reply(count > 0
          ? `🗑️ Removed **${coinId}** from crypto watchlist.`
          : `ℹ️ No entries found for **${coinId}**.`);
      }

      if (content.startsWith('!listcoins')) {
        const rows = await listCryptoWatchlist();
        if (!rows.length) return msg.reply('ℹ️ Crypto watchlist is empty.');
        const lines = rows.map((r) => `• ${r.symbol.toUpperCase()} (id: ${r.cid})`);
        return msg.reply(`🪙 **Crypto Watchlist**\n${lines.join('\n')}`);
      }

      if (content.startsWith('!addstock')) {
        if (!isAuthorized(msg.author.id)) return msg.reply('⛔ Not authorized.');
        const parts = content.split(/\s+/);
        const [, symbolRaw] = parts;
        if (!symbolRaw) return msg.reply('⚠️ Usage: `!addstock <SYMBOL>`');
        await addStockToWatchlist(symbolRaw.toUpperCase());
        return msg.reply(`✅ Added stock **${symbolRaw.toUpperCase()}** to watchlist.`);
      }

      if (content.startsWith('!removestock')) {
        if (!isAuthorized(msg.author.id)) return msg.reply('⛔ Not authorized.');
        const parts = content.split(/\s+/);
        const [, symbolRaw] = parts;
        if (!symbolRaw) return msg.reply('⚠️ Usage: `!removestock <SYMBOL>`');
        const count = await removeStockFromWatchlist(symbolRaw.toUpperCase());
        return msg.reply(count > 0
          ? `🗑️ Removed **${symbolRaw.toUpperCase()}** from stock watchlist.`
          : `ℹ️ No entries found for **${symbolRaw.toUpperCase()}**.`);
      }

      if (content.startsWith('!liststocks')) {
        const rows = await listStockWatchlist();
        if (!rows.length) return msg.reply('ℹ️ Stock watchlist is empty.');
        const lines = rows.map((r) => `• ${r.symbol.toUpperCase()}`);
        return msg.reply(`📈 **Stock Watchlist**\n${lines.join('\n')}`);
      }

      // -----------------------
      // SETTINGS COMMANDS
      // -----------------------
      if (content.startsWith('!set ')) {
        if (!isAuthorized(msg.author.id)) return msg.reply('⛔ Not authorized.');
        // Usage: !set KEY VALUE
        // Supported keys: RSI_PERIOD, BREAKOUT_THRESHOLD, CG_DELAY_MS, SCAN_INTERVAL_MINUTES
        const [, keyRaw, ...valParts] = content.split(/\s+/);
        if (!keyRaw || valParts.length === 0) {
          return msg.reply('⚠️ Usage: `!set <KEY> <VALUE>` e.g. `!set RSI_PERIOD 14`');
        }
        const key = keyRaw.toUpperCase();
        const value = valParts.join(' ');
        await setSetting(key, value);
        return msg.reply(`✅ Set \`${key}\` = \`${value}\`. Will apply on next scan (or run \`!scan\`).`);
      }

      if (content === '!settings' || content.startsWith('!settings ')) {
        const all = await getAllSettings();
        if (!Object.keys(all).length) return msg.reply('ℹ️ No settings stored.');
        const lines = Object.entries(all).map(([k, v]) => `• ${k} = ${v}`);
        return msg.reply(`⚙️ **Settings**\n${lines.join('\n')}`);
      }

      if (content.startsWith('!get ')) {
        const [, keyRaw] = content.split(/\s+/);
        if (!keyRaw) return msg.reply('⚠️ Usage: `!get <KEY>`');
        const key = keyRaw.toUpperCase();
        const value = await getSetting(key);
        return msg.reply(value != null ? `🔎 ${key} = ${value}` : `ℹ️ ${key} not set.`);
      }

      // -----------------------
      // SCAN COMMAND
      // -----------------------
      if (content === '!scan') {
        if (!isAuthorized(msg.author.id)) return msg.reply('⛔ Not authorized.');
        await msg.reply('⏳ Running scan now…');
        await runScanOnce();
        return msg.reply('✅ Scan complete.');
      }

    } catch (err) {
      console.error('Command error:', err?.response?.data || err.message || err);
      return msg.reply('❌ Command failed. Check logs.');
    }
  });

  client
    .login(process.env.DISCORD_BOT_TOKEN)
    .catch((err) => {
      console.error('Discord login failed:', err?.response?.data || err.message || err);
    });

  return client;
}

// Simple guesser for coin symbol if not provided
function guessSymbolFromId(id) {
  const map = {
    bitcoin: 'BTC',
    ethereum: 'ETH',
    litecoin: 'LTC',
    'shiba-inu': 'SHIB',
    solana: 'SOL',
    cardano: 'ADA',
    chainlink: 'LINK',
    polygon: 'MATIC',
    dogecoin: 'DOGE',
    ripple: 'XRP',
    binancecoin: 'BNB',
  };
  return map[id.toLowerCase()] || id.toUpperCase();
}

module.exports = { startDiscordBot };

