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

/**
 * Insert a trade record into the 'trades' table where 'data' is jsonb.
 */
async function logTradeToSupabase(tradeData) {
  try {
    const body = { data: tradeData };
    await axios.post(`${SUPABASE_URL}/rest/v1/trades`, body, { headers });
    console.log(`✅ Logged trade for ${tradeData.symbol} to Supabase`);
  } catch (err) {
    console.error('❌ Failed to log trade to Supabase:', err?.response?.data || err.message);
  }
}

/**
 * Close open trades for symbol+type by merging { status: 'CLOSED', note, closed_at }.
 */
async function closeTrade(symbol, type, note = '') {
  try {
    // 1) Get open rows
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

    // 2) Merge and PATCH each by id
    const closed_at = new Date().toISOString();
    for (const row of rows) {
      const id = row.id;
      const prev = row.data || {};
      const merged = { ...prev, status: 'CLOSED', note, closed_at };

      await axios.patch(
        `${SUPABASE_URL}/rest/v1/trades?id=eq.${id}`,
        { data: merged },
        { headers }
      );
    }

    console.log(`✅ Closed ${rows.length} trade(s) for ${symbol} (${type})`);
  } catch (err) {
    console.error('❌ Error closing trade:', err?.response?.data || err.message);
    throw err;
  }
}

/** Build a PostgREST URL with filters. */
function buildUrl(table, filters = {}, extraParams = {}) {
  const base = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  base.searchParams.set('select', '*');
  base.searchParams.set('order', 'created_at.desc');
  for (const [k, v] of Object.entries(filters)) base.searchParams.set(k, v);
  for (const [k, v] of Object.entries(extraParams)) base.searchParams.set(k, v);
  return base.toString();
}

/** Trades fetchers */
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
   WATCHLIST HELPERS (Supabase table: watchlist)
   ========================= */

/** Crypto: add coin by CoinGecko id and symbol (uppercased). */
async function addCryptoToWatchlist(coinId, symbol) {
  const body = { type: 'crypto', cid: coinId, symbol: symbol.toUpperCase() };
  // Use upsert via unique index; PostgREST needs Prefer header & on conflict
  try {
    await axios.post(`${SUPABASE_URL}/rest/v1/watchlist`, body, {
      headers: {
        ...headers,
        Prefer: 'resolution=merge-duplicates',
      },
    });
  } catch (err) {
    // If conflict handling isn’t available, we can fetch-and-check before insert.
    if (err?.response?.status !== 409) throw err;
  }
}

/** Crypto: remove by CoinGecko id */
async function removeCryptoFromWatchlist(coinId) {
  const url = buildUrl('watchlist', {
    type: 'eq.crypto',
    cid: `eq.${coinId}`,
  });
  const res = await axios.delete(url, { headers });
  // PostgREST returns deleted rows if Prefer: return=representation; keep simple here
  // If not returning, we can re-fetch count. For simplicity, try to fetch after delete:
  const verify = await listCryptoWatchlist();
  // Return diff isn't exact; return 1 as success indicator
  return 1;
}

/** Crypto: list watchlist */
async function listCryptoWatchlist() {
  const url = buildUrl('watchlist', { type: 'eq.crypto' });
  const res = await axios.get(url, { headers });
  return res.data || [];
}

/** Stocks: add symbol (uppercased) */
async function addStockToWatchlist(symbol) {
  const body = { type: 'stock', cid: null, symbol: symbol.toUpperCase() };
  try {
    await axios.post(`${SUPABASE_URL}/rest/v1/watchlist`, body, {
      headers: {
        ...headers,
        Prefer: 'resolution=merge-duplicates',
      },
    });
  } catch (err) {
    if (err?.response?.status !== 409) throw err;
  }
}

/** Stocks: remove symbol */
async function removeStockFromWatchlist(symbol) {
  const url = buildUrl('watchlist', {
    type: 'eq.stock',
    symbol: `eq.${symbol.toUpperCase()}`,
  });
  await axios.delete(url, { headers });
  return 1;
}

/** Stocks: list watchlist */
async function listStockWatchlist() {
  const url = buildUrl('watchlist', { type: 'eq.stock' });
  const res = await axios.get(url, { headers });
  return res.data || [];
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
};

