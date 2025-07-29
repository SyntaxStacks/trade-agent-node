require('dotenv').config();
const { scanMarket } = require('./src/scanner');
const { scanCrypto } = require('./src/cryptoScanner');

const timeout = 1000 * 60 * 60;

(async () => {
  while (true) {
    console.log("🔁 Running scanner...");
    await scanMarket();
    await scanCrypto();
    console.log("⏳ Waiting 1 hour...");
    await new Promise(res => setTimeout(res, timeout)); // 1 hour
  }
})();

