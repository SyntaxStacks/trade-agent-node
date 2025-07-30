// src/alerts.js
// Sends alerts to a Discord channel via Webhook.
// Exports:
//   - sendAlert(message: string): Promise<void>

require('dotenv').config();
const axios = require('axios');

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

if (!WEBHOOK_URL) {
  console.warn('⚠️ DISCORD_WEBHOOK_URL is not set; alerts will be skipped.');
}

/**
 * Post a message to the configured Discord webhook.
 * Gracefully no-ops if the webhook URL is missing.
 * @param {string} message
 */
async function sendAlert(message) {
  if (!WEBHOOK_URL) return;

  try {
    // Discord webhook accepts "content" up to ~2000 chars
    const payload = { content: sanitize(message).slice(0, 1900) };
    await axios.post(WEBHOOK_URL, payload, {
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (err) {
    const status = err?.response?.status;
    const body = err?.response?.data;
    console.error('❌ Discord alert failed:', status ? `${status}` : '', body || err.message);
  }
}

/**
 * Basic sanitization to avoid accidental mentions (@everyone) and trim weird spacing.
 */
function sanitize(text) {
  return String(text)
    .replace(/@everyone/gi, '[@everyone]')
    .replace(/@here/gi, '[@here]')
    .replace(/\s+\n/g, '\n')
    .trim();
}

module.exports = { sendAlert };

