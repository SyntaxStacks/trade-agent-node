const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'trades.json');

function logTrade({ symbol, type, price, reason }) {
  const existing = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : [];

  existing.push({
    timestamp: new Date().toISOString(),
    symbol,
    type,
    price,
    reason,
    status: "OPEN"
  });

  fs.writeFileSync(file, JSON.stringify(existing, null, 2));
}

module.exports = { logTrade };
