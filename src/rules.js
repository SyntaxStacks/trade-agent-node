const { RSI } = require('technicalindicators');

function evaluateTradeRules(symbol, prices) {
  const rsiValues = RSI.calculate({ values: prices, period: 14 });
  const latestRSI = rsiValues[rsiValues.length - 1];

  if (latestRSI < 30) {
    return `📉 ${symbol} RSI = ${latestRSI.toFixed(2)} — Oversold! Consider watching for bounce.`;
  }

  return null;
}

function detectBreakout(symbol, prices, thresholdPercent = 2) {
  const recentHigh = Math.max(...prices.slice(0, -1));  // exclude latest candle
  const latestPrice = prices[prices.length - 1];

  const breakout = latestPrice > recentHigh * (1 + thresholdPercent / 100);
  if (breakout) {
    return `🚀 ${symbol} breakout! Price $${latestPrice.toFixed(2)} > previous high $${recentHigh.toFixed(2)} (+${thresholdPercent}%)`;
  }

  return null;
}

module.exports = {
	evaluateTradeRules,
	detectBreakout,
};
