require('dotenv').config();
const { scanMarket } = require('./src/scanner');

(async () => {
  await scanMarket();
})();