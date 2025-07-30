require('dotenv').config();

const { Client, GatewayIntentBits } = require('discord.js');
const { scanMarket } = require('./src/scanner');
const { scanCrypto } = require('./src/cryptoScanner');
const { closeTrade } = require('./src/supabaseLogger');

const STARTUP_JITTER_MS = Math.floor(Math.random() * 10_000); // 0–10s stagger
const SCAN_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const BETWEEN_COINS_DELAY_MS = 2000; // keep your 429 buffer in cryptoScanner

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

  // Simple text command handler (e.g., "!close SOXL BREAKOUT took profit")
  client.on('messageCreate', async (msg) => {
    if (!msg.content) return;
    if (!msg.content.startsWith('!close')) return;

    const parts = msg.content.trim().split(' ');
    const [, symbol, type = 'RSI', ...noteParts] = parts;
    const note = noteParts.join(' ');

    if (!symbol) {
      return msg.reply('⚠️ Usage: `!close SYMBOL [TYPE] [NOTE]`');
    }

    try {
      await closeTrade(symbol.toUpperCase(), type.toUpperCase(), note);
      await msg.reply(`✅ Closed **${symbol.toUpperCase()}** (${type.toUpperCase()})\n📝 ${note || 'No note provided'}`);
    } catch (err) {
      console.error('Close trade error:', err);
      await msg.reply('❌ Failed to close trade. Check logs.');
    }
  });

  client
    .login(process.env.DISCORD_BOT_TOKEN)
    .catch((err) => {
      console.error('Discord login failed:', err);
      // Don’t exit; keep the scanner alive even if Discord has an issue
    });
}

// ---- Scanner loop (stocks + crypto) ----
async function runScanOnce() {
  console.log('🔁 Running scanner…');
  try {
    await scanMarket();
  } catch (e) {
    console.error('scanMarket error:', e?.message || e);
  }

  try {
    await scanCrypto();
  } catch (e) {
    console.error('scanCrypto error:', e?.message || e);
  }
  console.log('✅ Scan finished.');
}

async function startScannerLoop() {
  // Small startup jitter prevents thundering herd on shared IPs
  if (STARTUP_JITTER_MS) {
    console.log(`⏳ Startup jitter: waiting ${STARTUP_JITTER_MS}ms…`);
    await new Promise((r) => setTimeout(r, STARTUP_JITTER_MS));
  }

  // Immediate first run
  await runScanOnce();

  // Hourly thereafter
  setInterval(runScanOnce, SCAN_INTERVAL_MS);
}

// ---- Main ----
(async () => {
  startDiscordBot();
  await startScannerLoop();

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down…');
    process.exit(0);
  });
})();

