// src/supabaseLogger.js
const axios = require('axios');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_KEY in environment');
}

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

/* =========================
   TRADES (jsonb)
   ========================= */
async function logTradeToSupabase(tradeData) {
  try {
    const body = { data: tradeData };
    await axios.post(`${SUPABASE_URL}/rest/v1/trades`, body, { headers });
    console.log(`✅ Logged trade for ${tradeData.symbol} to Supabase`);
  } catch (err) {
    console.error('❌ Failed to log trade to Supabase:', err?.response?.data || err.message);
  }
}

async function closeTrade(symbol, type, note = '') {
  try {
    const listUrl = new URL(`${SUPABASE_URL}/rest/v1/trades`);
    listUrl.searchParams.set('select', '*');
    listUrl.searchParams.set('order', 'created_at.desc');
    listUrl.searchParams.set('data->>symbol', `eq.${symbol}`);
    listUrl.searchParams.set('data->>type', `eq.${type}`);
    listUrl.searchParams.set('data->>status', 'eq.OPEN');

    const res = await axios.get(listUrl.toString(), { headers });
    const rows = res.data || [];
    if (!rows.length) {
      console.log(`ℹ️ No OPEN trades found for ${symbol} (${type})`);
      return;
    }

    const closed_at = new Date().toISOString();
    for (const row of rows) {
      const id = row.id;
      const prev = row.data || {};
      const merged = { ...prev, status: 'CLOSED', note, closed_at };
      await axios.patch(`${SUPABASE_URL}/rest/v1/trades?id=eq.${id}`, { data: merged }, { headers });
    }
    console.log(`✅ Closed ${rows.length} trade(s) for ${symbol} (${type})`);
  } catch (err) {
    console.error('❌ Error closing trade:', err?.response?.data || err.message);
    throw err;
  }
}

function buildUrl(table, filters = {}, extraParams = {}) {
  const base = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  base.searchParams.set('select', '*');
  base.searchParams.set('order', 'created_at.desc');
  for (const [k, v] of Object.entries(filters)) base.searchParams.set(k, v);
  for (const [k, v] of Object.entries(extraParams)) base.searchParams.set(k, v);
  return base.toString();
}

async function fetchTrades(filters = {}) {
  const url = buildUrl('trades', filters);
  const res = await axios.get(url, { headers });
  return res.data;
}

async function fetchTradesSince(isoString, extraJsonbFilters = {}) {
  const filters = { ...extraJsonbFilters, created_at: `gte.${isoString}` };
  return fetchTrades(filters);
}

function summarizeTrades(trades) {
  const byType = {};
  const bySymbol = {};
  for (const row of trades || []) {
    const t = row.data || {};
    const type = (t.type || 'UNKNOWN').toUpperCase();
    const symbol = (t.symbol || 'UNKNOWN').toUpperCase();
    byType[type] = (byType[type] || 0) + 1;
    bySymbol[symbol] = (bySymbol[symbol] || 0) + 1;
  }
  return { byType, bySymbol, total: trades?.length || 0 };
}

/* =========================
   WATCHLIST
   ========================= */
async function addCryptoToWatchlist(coinId, symbol) {
  const body = { type: 'crypto', cid: coinId, symbol: symbol.toUpperCase() };
  await axios.post(`${SUPABASE_URL}/rest/v1/watchlist`, body, {
    headers: { ...headers, Prefer: 'resolution=merge-duplicates' },
  });
}

async function removeCryptoFromWatchlist(coinId) {
  const url = buildUrl('watchlist', { type: 'eq.crypto', cid: `eq.${coinId}` });
  await axios.delete(url, { headers });
  return 1;
}

async function listCryptoWatchlist() {
  const url = buildUrl('watchlist', { type: 'eq.crypto' });
  const res = await axios.get(url, { headers });
  return res.data || [];
}

async function addStockToWatchlist(symbol) {
  const body = { type: 'stock', cid: null, symbol: symbol.toUpperCase() };
  await axios.post(`${SUPABASE_URL}/rest/v1/watchlist`, body, {
    headers: { ...headers, Prefer: 'resolution=merge-duplicates' },
  });
}

async function removeStockFromWatchlist(symbol) {
  const url = buildUrl('watchlist', { type: 'eq.stock', symbol: `eq.${symbol.toUpperCase()}` });
  await axios.delete(url, { headers });
  return 1;
}

async function listStockWatchlist() {
  const url = buildUrl('watchlist', { type: 'eq.stock' });
  const res = await axios.get(url, { headers });
  return res.data || [];
}

/* =========================
   SETTINGS (key/value)
   ========================= */
async function setSetting(key, value) {
  const body = { key, value };
  // Upsert: requires Prefer header (merge-duplicates) with primary key on key
  await axios.post(`${SUPABASE_URL}/rest/v1/settings`, body, {
    headers: { ...headers, Prefer: 'resolution=merge-duplicates' },
  });
}

async function getSetting(key) {
  const url = buildUrl('settings', { key: `eq.${key}` });
  const res = await axios.get(url, { headers });
  const row = (res.data || [])[0];
  return row ? row.value : null;
}

async function getAllSettings() {
  const url = buildUrl('settings');
  const res = await axios.get(url, { headers });
  const out = {};
  for (const row of res.data || []) {
    out[row.key] = row.value;
  }
  return out;
}

module.exports = {
  // trades
  logTradeToSupabase,
  closeTrade,
  fetchTrades,
  fetchTradesSince,
  summarizeTrades,
  // watchlist
  addCryptoToWatchlist,
  removeCryptoFromWatchlist,
  listCryptoWatchlist,
  addStockToWatchlist,
  removeStockFromWatchlist,
  listStockWatchlist,
  // settings
  setSetting,
  getSetting,
  getAllSettings,
};

