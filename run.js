require('dotenv').config();
const { scanMarket } = require('./src/scanner');
const { scanCrypto } = require('./src/cryptoScanner');

(async () => {
  await scanMarket();
  await scanCrypto();
})();
