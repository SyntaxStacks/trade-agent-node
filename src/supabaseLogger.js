const axios = require('axios');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_KEY in .env");
}

const headers = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json'
};

async function logTradeToSupabase(tradeData) {
  try {
    const res = await axios.post(`${SUPABASE_URL}/rest/v1/trades`,
      { data: tradeData },
      { headers }
    );

    console.log(`✅ Logged trade for ${tradeData.symbol} to Supabase`);
  } catch (err) {
    console.error("❌ Failed to log trade to Supabase:", err.response?.data || err.message);
  }
}

async function closeTrade(symbol, type, note = "") {
  try {
    const res = await axios.patch(
      `${SUPABASE_URL}/rest/v1/trades?data->>symbol=eq.${symbol}&data->>type=eq.${type}&data->>status=eq.OPEN`,
      { data: { status: "CLOSED", note } },
      {
        headers,
        params: {
          select: '*'
        }
      }
    );

    console.log(`✅ Closed ${res.data.length} trade(s) for ${symbol} (${type})`);
  } catch (err) {
    console.error("❌ Error closing trade:", err.response?.data || err.message);
  }
}

module.exports = { logTradeToSupabase, closeTrade };
