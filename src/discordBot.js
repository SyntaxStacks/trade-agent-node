require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { closeTrade } = require('./supabaseLogger');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

client.on('ready', () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (msg) => {
  if (!msg.content.startsWith('!close')) return;

  const args = msg.content.trim().split(' ');
  const [, symbol, type = 'RSI', ...noteParts] = args;
  const note = noteParts.join(' ');

  if (!symbol) {
    return msg.reply("⚠️ Usage: `!close SYMBOL [TYPE] [NOTE]`");
  }

  try {
    await closeTrade(symbol.toUpperCase(), type.toUpperCase(), note);
    msg.reply(`✅ Closed trade for **${symbol.toUpperCase()}** (${type.toUpperCase()})\n📝 ${note || 'No note provided'}`);
  } catch (err) {
    msg.reply(`❌ Failed to close trade: ${err.message}`);
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);

