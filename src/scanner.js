const { sendAlert } = require('./alerts');
const { evaluateTradeRules } = require('./rules');
const axios = require('axios');

async function fetchPrice(symbol) {
  const response = await axios.get(`https://www.alphavantage.co/query`, {
    params: {
      function: 'TIME_SERIES_INTRADAY',
      symbol,
      interval: '5min',
      apikey: 'demo' // Replace with real key later
    }
  });
  return response.data;
}

async function scanMarket() {
  const symbols = ['SOXL'];
  for (let symbol of symbols) {
    const data = await fetchPrice(symbol);
    const tradeSignal = evaluateTradeRules(symbol, data);
    if (tradeSignal) {
      await sendAlert(tradeSignal);
    }
  }
}

module.exports = { scanMarket };