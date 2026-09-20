/**
 * Express server entry point.
 * Mounts all API routes, handles CORS, and manages Playwright lifecycle.
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { closeBrowser } = require('./scraper/browser');
const { runScrapeAll } = require('./scraper');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'X-Cron-Secret'],
}));
app.use(express.json());

// Health check endpoint (for Render keep-alive and monitoring)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Mount API routes
app.use('/api/products', require('./routes/products'));
app.use('/api/scrape', require('./routes/scrape'));
app.use('/api/history', require('./routes/history'));

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[Server] Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error', details: err.message });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`[Server] INE Price Tracker backend running on port ${PORT}`);
  console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);

  // Schedule a local scrape every 2 hours (in ms)
  const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
  setInterval(async () => {
    console.log(`[Cron] Automatically triggering local scrape (runs every 2 hours)...`);
    try {
      await runScrapeAll();
      console.log(`[Cron] Automatic scrape completed successfully.`);
    } catch (err) {
      console.error(`[Cron] Automatic scrape failed:`, err.message);
    }
  }, TWO_HOURS_MS);
});

// Graceful shutdown
async function shutdown(signal) {
  console.log(`[Server] Received ${signal}, shutting down gracefully...`);
  await closeBrowser();
  server.close(() => {
    console.log('[Server] HTTP server closed');
    process.exit(0);
  });
  // Force exit after 10 seconds
  setTimeout(() => process.exit(1), 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = app;
