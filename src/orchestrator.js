// src/orchestrator.js
require('dotenv').config();
const { scanMarket } = require('./scanner');
const { scanCrypto } = require('./cryptoScanner');
const { getAllSettings } = require('./supabaseLogger');

const DEFAULT_SCAN_INTERVAL_MIN = 60;

function applyRuntimeSettings(settings) {
  // Map known settings into process.env so existing modules pick them up
  if (settings.RSI_PERIOD) process.env.RSI_PERIOD = String(settings.RSI_PERIOD);
  if (settings.BREAKOUT_THRESHOLD) process.env.BREAKOUT_THRESHOLD = String(settings.BREAKOUT_THRESHOLD);
  if (settings.CG_DELAY_MS) process.env.CG_DELAY_MS = String(settings.CG_DELAY_MS);
}

async function runScanOnce() {
  console.log('🔁 Running scanner…');

  // Refresh settings each run (so !set takes effect next cycle or !scan)
  try {
    const settings = await getAllSettings();
    applyRuntimeSettings(settings);
  } catch (e) {
    console.error('Settings refresh failed (using last known/env):', e?.message || e);
  }

  try {
    await scanMarket();
  } catch (e) {
    console.error('scanMarket error:', e?.response?.data || e.message || e);
  }

  try {
    await scanCrypto();
  } catch (e) {
    console.error('scanCrypto error:', e?.response?.data || e.message || e);
  }

  console.log('✅ Scan finished.');
}

async function startScannerLoop() {
  // Initial settings load to decide interval
  let intervalMin = DEFAULT_SCAN_INTERVAL_MIN;
  try {
    const settings = await getAllSettings();
    applyRuntimeSettings(settings);
    if (settings.SCAN_INTERVAL_MINUTES) {
      const n = parseInt(settings.SCAN_INTERVAL_MINUTES, 10);
      if (Number.isFinite(n) && n >= 5 && n <= 720) intervalMin = n;
    }
  } catch (e) {
    console.warn('Could not fetch settings at startup; using defaults.', e?.message || e);
  }

  // A tiny startup jitter reduces herd effects on shared IPs
  const jitter = Math.floor(Math.random() * 10_000);
  if (jitter) {
    console.log(`⏳ Startup jitter: waiting ${jitter}ms…`);
    await new Promise((r) => setTimeout(r, jitter));
  }

  await runScanOnce();

  const intervalMs = intervalMin * 60 * 1000;
  console.log(`⏱️  Next scans every ${intervalMin} minute(s).`);
  setInterval(runScanOnce, intervalMs);
}

module.exports = { startScannerLoop, runScanOnce };

