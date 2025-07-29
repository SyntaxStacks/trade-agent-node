const axios = require('axios');

async function sendAlert(message) {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) throw new Error("Missing Discord webhook URL");

  await axios.post(url, {
    content: `📢 TRADE ALERT: ${message}`
  });
}

module.exports = { sendAlert };