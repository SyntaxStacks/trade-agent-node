// src/cryptoScanner.js
require('dotenv').config();
const axios = require('axios');
const { RSI } = require('technicalindicators');
const { sendAlert } = require('./alerts');
const { detectBreakout } = require('./rules');
const { logTradeToSupabase } = require('./supabaseLogger');
const { listCryptoWatchlist } = require('./supabaseLogger');

const DEFAULT_COINS = [
  { id: 'bitcoin', symbol: 'BTC' },
  { id: 'ethereum', symbol: 'ETH' },
  { id: 'litecoin', symbol: 'LTC' },
  { id: 'shiba-inu', symbol: 'SHIB' },
];

async function resolveCoins() {
  try {
    const rows = await listCryptoWatchlist();
    if (!rows.length) return DEFAULT_COINS;
    return rows.map((r) => ({
      id: r.cid,
      symbol: (r.symbol || '').toUpperCase(),
    }));
  } catch (e) {
    console.error('resolveCoins watchlist error; using defaults:', e?.message || e);
    return DEFAULT_COINS;
  }
}

/**
 * Fetch prices for last ~48h from CoinGecko.
 * Omitting interval and using days=2 returns hourly data.
 * Returns an array of prices oldest -> newest.
 */
async function fetchCoinPrices(coinId) {
  const url = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart`;
  const params = { vs_currency: 'usd', days: 2 };

  const res = await axios.get(url, { params });
  if (!res.data?.prices || !Array.isArray(res.data.prices)) {
    throw new Error(`CoinGecko missing prices for ${coinId}`);
  }
  return res.data.prices.map((p) => p[1]).filter((v) => Number.isFinite(v));
}

/**
 * Scan configured crypto coins for RSI (<30) and Breakout signals.
 * Adds a small delay between requests to avoid 429 rate limits.
 */
async function scanCrypto() {
  const coins = await resolveCoins();
  const BETWEEN_COINS_DELAY_MS = parseInt(process.env.CG_DELAY_MS || '2000', 10);

  for (const coin of coins) {
    try {
      const prices = await fetchCoinPrices(coin.id);

      // --- RSI (14) ---
      const rsiValues = RSI.calculate({ values: prices, period: 14 });
      const latestRSI = rsiValues.at(-1);

      if (Number.isFinite(latestRSI) && latestRSI < 30) {
        const msg = `🪙 ${coin.symbol} RSI = ${latestRSI.toFixed(2)} — Oversold!`;
        await sendAlert(msg);
        await logTradeToSupabase({
          symbol: coin.symbol,
          type: 'RSI',
          price: prices.at(-1),
          reason: msg,
          status: 'OPEN',
        });
      }

      // --- Breakout (+2% above recent high excluding last bar) ---
      const breakoutSignal = detectBreakout(coin.symbol, prices, 2);
      if (breakoutSignal) {
        await sendAlert(breakoutSignal);
        await logTradeToSupabase({
          symbol: coin.symbol,
          type: 'Breakout',
          price: prices.at(-1),
          reason: breakoutSignal,
          status: 'OPEN',
        });
      }

      if (BETWEEN_COINS_DELAY_MS > 0) {
        await new Promise((r) => setTimeout(r, BETWEEN_COINS_DELAY_MS));
      }
    } catch (err) {
      const status = err?.response?.status;
      const msg = err?.response?.data || err.message || err;
      console.error(`Error scanning ${coin.symbol}:`, status ? `${status} - ${msg}` : msg);
    }
  }
}

module.exports = { scanCrypto };

