const { sendAlert } = require('./alerts');
const { RSI } = require('technicalindicators');
const axios = require('axios');
const { detectBreakout } = require('./rules');
const { logTrade } = require('./logger');

const coins = [
  { id: 'bitcoin', symbol: 'BTC' },
  { id: 'ethereum', symbol: 'ETH' },
  { id: 'litecoin', symbol: 'LTC' },
  { id: 'shiba-inu', symbol: 'SHIB' }
];

async function fetchCoinPrices(coinId) {
  const url = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=2`;
  const res = await axios.get(url);
  return res.data.prices.map(p => p[1]); // p = [timestamp, price]
}

async function scanCrypto() {
  for (let coin of coins) {
    try {
      const prices = await fetchCoinPrices(coin.id);
      const rsiValues = RSI.calculate({ values: prices, period: 14 });
      const latestRSI = rsiValues[rsiValues.length - 1];

      if (latestRSI < 30) {
        await sendAlert(`🪙 ${coin.symbol} RSI = ${latestRSI.toFixed(2)} — Oversold!`);
				logTrade({ symbol: coin.symbol, type: 'RSI', price: prices.at(-1), reason: tradeSignal });
      }
			const breakoutSignal = detectBreakout(coin.symbol, prices, 2);
			if (breakoutSignal) {
				await sendAlert(breakoutSignal);
				logTrade({ symbol: coin.symbol, type: 'Breakout', price: prices.at(-1), reason: breakoutSignal });
			}
    } catch (err) {
      console.error(`Error scanning ${coin.symbol}:`, err.message);
    }
  }
}

module.exports = { scanCrypto };

