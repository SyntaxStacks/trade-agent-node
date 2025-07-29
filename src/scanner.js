const { sendAlert } = require('./alerts');
const { evaluateTradeRules, detectBreakout } = require('./rules');
const axios = require('axios');
require('dotenv').config();

async function fetchPriceData(symbol) {
  const response = await axios.get(`https://www.alphavantage.co/query`, {
    params: {
      function: 'TIME_SERIES_INTRADAY',
      symbol,
      interval: '5min',
      apikey: process.env.ALPHA_VANTAGE_API_KEY
    }
  });

  const timeseries = response.data['Time Series (5min)'];
  const prices = Object.values(timeseries).map(bar => parseFloat(bar['4. close']));
  return prices.reverse(); // Oldest to newest
}

async function scanMarket() {
  const symbols = ['SOXL'];

  for (let symbol of symbols) {
    try {
      const prices = await fetchPriceData(symbol);
      const tradeSignal = evaluateTradeRules(symbol, prices);
      if (tradeSignal) {
        await sendAlert(tradeSignal);
      }
			const breakoutSignal = detectBreakout(symbol, prices, 2);
			if (breakoutSignal) {
				await sendAlert(breakoutSignal);
			}
    } catch (err) {
      console.error(`Error scanning ${symbol}:`, err.message);
    }
  }
}

module.exports = { scanMarket };
