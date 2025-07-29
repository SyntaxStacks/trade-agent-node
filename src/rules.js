function evaluateTradeRules(symbol, data) {
  // Placeholder logic: alert if price exists (you can build real rules here)
  const pricePoint = Object.values(data['Time Series (5min)'])[0];
  const currentPrice = pricePoint['4. close'];
  return `${symbol} current price is $${currentPrice}. Consider buying if RSI < 30 (check manually).`;
}

module.exports = { evaluateTradeRules };