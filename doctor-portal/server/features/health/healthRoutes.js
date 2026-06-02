const express = require('express');
const sequelize = require('../../db/sequelize');
const { isLiveKitConfigured } = require('../livekit/livekitService');
const router = express.Router();

router.get('/health', async (req, res) => {
  let pgConnected = false;
  let pgLatencyMs = null;
  try {
    const start = process.hrtime.bigint();
    await sequelize.authenticate();
    pgLatencyMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    pgConnected = true;
  } catch {
    // pgConnected stays false
  }

  res.status(pgConnected ? 200 : 503).json({
    status: pgConnected ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    postgres: { connected: pgConnected, latencyMs: pgLatencyMs },
    port: process.env.PORT || 5001,
    livekitConfigured: isLiveKitConfigured(),
  });
});

module.exports = router;
