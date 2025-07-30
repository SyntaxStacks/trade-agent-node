// index.js
require('dotenv').config();

const { Client, GatewayIntentBits } = require('discord.js');
const { scanMarket } = require('./src/scanner');
const { scanCrypto } = require('./src/cryptoScanner');
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
} = require('./src/supabaseLogger');

const STARTUP_JITTER_MS = Math.floor(Math.random() * 10_000); // 0–10s stagger
const SCAN_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

// ---- Discord Bot bootstrap ----
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

    // --- Close Trade ---
    // Usage: !close SYMBOL [TYPE] [NOTE...]
    if (content.startsWith('!close')) {
      const parts = content.split(/\s+/);
      const [, symbol, type = 'RSI', ...noteParts] = parts;
      const note = noteParts.join(' ');

      if (!symbol) {
        return msg.reply('⚠️ Usage: `!close SYMBOL [TYPE] [NOTE]`');
      }

      try {
        await closeTrade(symbol.toUpperCase(), type.toUpperCase(), note);
        await msg.reply(
          `✅ Closed **${symbol.toUpperCase()}** (${type.toUpperCase()})\n📝 ${note || 'No note provided'}`
        );
      } catch (err) {
        console.error('Close trade error:', err?.response?.data || err.message || err);
        await msg.reply('❌ Failed to close trade. Check logs.');
      }
      return;
    }

    // --- Daily Summary ---
    // Usage:
    //   !summary          -> since today 00:00 PT
    //   !summary 2        -> last 2 days (PT)
    //   !summary utc      -> since UTC midnight
    //   !summary 3 utc    -> last 3 days using UTC
    if (content.startsWith('!summary')) {
      try {
        const parts = content.split(/\s+/);
        const maybeDays = parts[1] || '';
        const maybeTz = (parts[2] || parts[1] || '').toLowerCase();
        const useUtc = maybeTz === 'utc';

        const daysArg = Number.isNaN(+maybeDays) ? 1 : Math.max(1, Math.min(7, +maybeDays));
        const tz = useUtc ? 'UTC' : 'America/Los_Angeles';

        // Build ISO for midnight in the chosen TZ
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

        const openTrades = await fetchTrades({ 'data->>status': 'eq.OPEN' });
        const openSummary = summarizeTrades(openTrades);

        const closedSince = await fetchTradesSince(sinceIso, { 'data->>status': 'eq.CLOSED' });
        const closedSummary = summarizeTrades(closedSince);

        const fmtMap = (m) =>
          Object.entries(m)
            .sort((a, b) => b[1] - a[1])
            .map(([k, v]) => `${k}: ${v}`)
            .join(', ') || '—';

        const response =
          `📊 **Summary** (${tz}, since ${sinceIso})\n` +
          `• Open trades: **${openSummary.total}**\n` +
          `  • by type: ${fmtMap(openSummary.byType)}\n` +
          `  • by symbol: ${fmtMap(openSummary.bySymbol)}\n` +
          `• Closed trades: **${closedSummary.total}**\n` +
          `  • by type: ${fmtMap(closedSummary.byType)}\n` +
          `  • by symbol: ${fmtMap(closedSummary.bySymbol)}`;

        await msg.reply(response);
      } catch (err) {
        console.error('!summary error:', err?.response?.data || err.message || err);
        await msg.reply('❌ Failed to fetch summary. Check logs.');
      }
      return;
    }

    // --- Watchlist Commands ---

    // Add coin: !addcoin <coingecko-id> [SYMBOL]
    if (content.startsWith('!addcoin')) {
      const parts = content.split(/\s+/);
      const [, coinId, providedSymbol] = parts;
      if (!coinId) {
        return msg.reply('⚠️ Usage: `!addcoin <coingecko-id> [SYMBOL]` e.g. `!addcoin bitcoin BTC`');
      }
      const symbol = (providedSymbol || guessSymbolFromId(coinId)).toUpperCase();
      try {
        await addCryptoToWatchlist(coinId, symbol);
        await msg.reply(`✅ Added coin **${symbol}** (id: ${coinId}) to watchlist.`);
      } catch (e) {
        console.error('addcoin error:', e?.response?.data || e.message || e);
        await msg.reply('❌ Failed to add coin. It may already exist.');
      }
      return;
    }

    // Remove coin: !removecoin <coingecko-id>
    if (content.startsWith('!removecoin')) {
      const parts = content.split(/\s+/);
      const [, coinId] = parts;
      if (!coinId) {
        return msg.reply('⚠️ Usage: `!removecoin <coingecko-id>` e.g. `!removecoin bitcoin`');
      }
      try {
        const count = await removeCryptoFromWatchlist(coinId);
        if (count > 0) {
          await msg.reply(`🗑️ Removed **${coinId}** from crypto watchlist (${count} row(s)).`);
        } else {
          await msg.reply(`ℹ️ No entries found for **${coinId}**.`);
        }
      } catch (e) {
        console.error('removecoin error:', e?.response?.data || e.message || e);
        await msg.reply('❌ Failed to remove coin. Check logs.');
      }
      return;
    }

    // List coins: !listcoins
    if (content.startsWith('!listcoins')) {
      try {
        const rows = await listCryptoWatchlist();
        if (!rows.length) return msg.reply('ℹ️ Crypto watchlist is empty.');
        const lines = rows.map((r) => `• ${r.symbol.toUpperCase()} (id: ${r.cid})`);
        await msg.reply(`🪙 **Crypto Watchlist**\n${lines.join('\n')}`);
      } catch (e) {
        console.error('listcoins error:', e?.response?.data || e.message || e);
        await msg.reply('❌ Failed to list coins. Check logs.');
      }
      return;
    }

    // Add stock: !addstock <SYMBOL>
    if (content.startsWith('!addstock')) {
      const parts = content.split(/\s+/);
      const [, symbolRaw] = parts;
      if (!symbolRaw) {
        return msg.reply('⚠️ Usage: `!addstock <SYMBOL>` e.g. `!addstock SOXL`');
      }
      const symbol = symbolRaw.toUpperCase();
      try {
        await addStockToWatchlist(symbol);
        await msg.reply(`✅ Added stock **${symbol}** to watchlist.`);
      } catch (e) {
        console.error('addstock error:', e?.response?.data || e.message || e);
        await msg.reply('❌ Failed to add stock. It may already exist.');
      }
      return;
    }

    // Remove stock: !removestock <SYMBOL>
    if (content.startsWith('!removestock')) {
      const parts = content.split(/\s+/);
      const [, symbolRaw] = parts;
      if (!symbolRaw) {
        return msg.reply('⚠️ Usage: `!removestock <SYMBOL>` e.g. `!removestock SOXL`');
      }
      const symbol = symbolRaw.toUpperCase();
      try {
        const count = await removeStockFromWatchlist(symbol);
        if (count > 0) {
          await msg.reply(`🗑️ Removed **${symbol}** from stock watchlist (${count} row(s)).`);
        } else {
          await msg.reply(`ℹ️ No entries found for **${symbol}**.`);
        }
      } catch (e) {
        console.error('removestock error:', e?.response?.data || e.message || e);
        await msg.reply('❌ Failed to remove stock. Check logs.');
      }
      return;
    }

    // List stocks: !liststocks
    if (content.startsWith('!liststocks')) {
      try {
        const rows = await listStockWatchlist();
        if (!rows.length) return msg.reply('ℹ️ Stock watchlist is empty.');
        const lines = rows.map((r) => `• ${r.symbol.toUpperCase()}`);
        await msg.reply(`📈 **Stock Watchlist**\n${lines.join('\n')}`);
      } catch (e) {
        console.error('liststocks error:', e?.response?.data || e.message || e);
        await msg.reply('❌ Failed to list stocks. Check logs.');
      }
      return;
    }
  });

  client
    .login(process.env.DISCORD_BOT_TOKEN)
    .catch((err) => {
      console.error('Discord login failed:', err?.response?.data || err.message || err);
      // Keep scanner loop running even if bot fails.
    });
}

// ---- Scanner loop (stocks + crypto) ----
async function runScanOnce() {
  console.log('🔁 Running scanner…');
  try {
    await scanMarket();
  } catch (e) {
    console.error('scanMarket error:', e?.response?.data || e.message || e);
  }

  try {
    await scanCrypto();
  } catch (e) {
    console.error('scanCrypto error:', e?.response?.data || e.message || e);
  }
  console.log('✅ Scan finished.');
}

async function startScannerLoop() {
  if (STARTUP_JITTER_MS) {
    console.log(`⏳ Startup jitter: waiting ${STARTUP_JITTER_MS}ms…`);
    await new Promise((r) => setTimeout(r, STARTUP_JITTER_MS));
  }

  // Immediate run + hourly thereafter
  await runScanOnce();
  setInterval(runScanOnce, SCAN_INTERVAL_MS);
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

// ---- Main ----
(async () => {
  startDiscordBot();
  await startScannerLoop();

  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down…');
    process.exit(0);
  });
})();

