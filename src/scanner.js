// src/scanner.js
require('dotenv').config();
const axios = require('axios');
const { sendAlert } = require('./alerts');
const { evaluateTradeRules, detectBreakout } = require('./rules');
const { logTradeToSupabase, listStockWatchlist } = require('./supabaseLogger');

const DEFAULT_STOCKS = ['SOXL'];

/**
 * Resolve list of stock symbols from Supabase watchlist.
 * Falls back to DEFAULT_STOCKS if empty or on error.
 */
async function resolveStockSymbols() {
  try {
    const rows = await listStockWatchlist();
    const symbols = rows.map((r) => (r.symbol || '').toUpperCase()).filter(Boolean);
    return symbols.length ? symbols : DEFAULT_STOCKS;
  } catch (e) {
    console.error('resolveStockSymbols watchlist error; using defaults:', e?.message || e);
    return DEFAULT_STOCKS;
  }
}

/**
 * Fetch 5‑minute intraday prices from Alpha Vantage.
 * Returns an array of closing prices oldest -> newest.
 */
async function fetchIntradayPrices(symbol) {
  const apikey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apikey) {
    throw new Error('Missing ALPHA_VANTAGE_API_KEY');
  }

  const url = 'https://www.alphavantage.co/query';
  const params = {
    function: 'TIME_SERIES_INTRADAY',
    symbol,
    interval: '5min',
    outputsize: 'compact',
    apikey,
  };

  const res = await axios.get(url, { params });

  if (res.data?.Note) throw new Error(`AlphaVantage Note: ${res.data.Note}`);
  if (res.data?.Information) throw new Error(`AlphaVantage Info: ${res.data.Information}`);
  if (!res.data || !res.data['Time Series (5min)']) {
    throw new Error(`AlphaVantage missing timeseries for ${symbol}`);
  }

  const timeseries = res.data['Time Series (5min)'];
  const closes = Object.values(timeseries)
    .map((bar) => parseFloat(bar['4. close']))
    .filter((v) => Number.isFinite(v));

  return closes.reverse();
}

/**
 * Scan stock symbols for RSI (<30) and Breakout signals.
 */
async function scanMarket() {
  const symbols = await resolveStockSymbols();

  for (const symbol of symbols) {
    try {
      const prices = await fetchIntradayPrices(symbol);

      // --- RSI rule ---
      const rsiSignal = evaluateTradeRules(symbol, prices);
      if (rsiSignal) {
        await sendAlert(rsiSignal);
        await logTradeToSupabase({
          symbol,
          type: 'RSI',
          price: prices.at(-1),
          reason: rsiSignal,
          status: 'OPEN',
        });
      }

      // --- Breakout rule ---
      const breakoutSignal = detectBreakout(symbol, prices, 2);
      if (breakoutSignal) {
        await sendAlert(breakoutSignal);
        await logTradeToSupabase({
          symbol,
          type: 'Breakout',
          price: prices.at(-1),
          reason: breakoutSignal,
          status: 'OPEN',
        });
      }
    } catch (err) {
      const status = err?.response?.status;
      const msg = err?.response?.data || err.message || err;
      console.error(`Error scanning ${symbol}:`, status ? `${status} - ${msg}` : msg);
    }
  }
}

module.exports = { scanMarket };

