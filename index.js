// index.js
require('dotenv').config();

const { startDiscordBot } = require('./src/commands');
const { startScannerLoop } = require('./src/orchestrator');

(async () => {
  startDiscordBot();            // starts the Discord bot and command router
  await startScannerLoop();     // kicks off the hourly (configurable) scan loop

  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down…');
    process.exit(0);
  });
})();

