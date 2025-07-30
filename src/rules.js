// src/rules.js
// Technical rules shared by stock and crypto scanners.
// Provides:
//   - evaluateTradeRules(symbol, prices): RSI-based oversold signal
//   - detectBreakout(symbol, prices, thresholdPercent): simple momentum breakout

const { RSI } = require('technicalindicators');

/**
 * Compute RSI and emit a basic oversold signal (< 30).
 * @param {string} symbol - Ticker or coin symbol (e.g., SOXL, BTC)
 * @param {number[]} prices - Closing prices oldest -> newest
 * @returns {string|null} - Alert message or null if no signal
 */
function evaluateTradeRules(symbol, prices) {
  const period = parseInt(process.env.RSI_PERIOD || '14', 10);

  if (!Array.isArray(prices) || prices.length < period + 1) {
    return null; // not enough data to compute RSI
  }

  const rsiValues = RSI.calculate({ values: prices, period });
  const latestRSI = rsiValues[rsiValues.length - 1];

  if (!Number.isFinite(latestRSI)) return null;

  if (latestRSI < 30) {
    return `📉 ${symbol} RSI = ${latestRSI.toFixed(2)} — Oversold! Consider watching for a bounce.`;
  }

  return null;
}

/**
 * Detect a simple breakout: latest price > previous recent high by thresholdPercent.
 * Excludes the latest bar when computing the recent high to avoid self-comparison.
 * @param {string} symbol
 * @param {number[]} prices - Closing prices oldest -> newest
 * @param {number} thresholdPercent - e.g., 2 means +2% over recent high
 * @param {number} lookback - (optional) number of bars to look back for the "recent high". Defaults to all.
 * @returns {string|null}
 */
function detectBreakout(symbol, prices, thresholdPercent = 2, lookback) {
  if (!Array.isArray(prices) || prices.length < 3) return null;

  const latest = prices[prices.length - 1];

  // Determine slice for recent high; exclude the latest bar
  const end = prices.length - 1;
  const start = Math.max(0, lookback ? end - lookback : 0);
  const window = prices.slice(start, end);

  if (window.length === 0) return null;

  const recentHigh = Math.max(...window);
  const trigger = recentHigh * (1 + thresholdPercent / 100);

  if (latest > trigger) {
    const pct = ((latest / recentHigh) - 1) * 100;
    return `🚀 ${symbol} breakout!\nPrice ${formatPrice(latest)} > prior high ${formatPrice(recentHigh)} by ${pct.toFixed(2)}% (threshold ${thresholdPercent}%).`;
  }

  return null;
}

// --- helpers ---
function formatPrice(n) {
  if (!Number.isFinite(n)) return `${n}`;
  if (n >= 1000) return n.toFixed(2);
  if (n >= 1) return n.toFixed(2);
  if (n >= 0.1) return n.toFixed(3);
  return n.toFixed(6);
}

module.exports = {
  evaluateTradeRules,
  detectBreakout,
};

