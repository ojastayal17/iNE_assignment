/**
 * Scrape trigger API routes.
 * The cron endpoint is the primary trigger for scheduled scrapes.
 * Protected with a secret header to prevent unauthorized triggering.
 */

const express = require('express');
const router = express.Router();
const { runScrapeAll, scrapeSingleProduct } = require('../scraper');

// Track if a scrape is currently running (prevent overlapping scrapes)
let isRunning = false;
let lastScrapeResult = null;
let lastScrapeTime = null;

/**
 * POST /api/scrape/trigger
 * Trigger a full scrape of all tracked products.
 * Protected with X-Cron-Secret header.
 * Also accepts secret as a query param for cron-job.org compatibility.
 */
router.post('/trigger', async (req, res) => {
  try {
    // Verify cron secret
    const cronSecret = process.env.CRON_SECRET;
    const providedSecret =
      req.headers['x-cron-secret'] ||
      req.query.secret ||
      req.body?.secret;

    if (cronSecret && providedSecret !== cronSecret) {
      return res.status(401).json({ error: 'Unauthorized: Invalid or missing cron secret' });
    }

    // Prevent overlapping scrapes
    if (isRunning) {
      return res.status(409).json({
        error: 'A scrape is already in progress',
        lastScrapeTime,
      });
    }

    isRunning = true;

    // Send immediate response (scrape runs in background)
    res.json({
      message: 'Scrape triggered successfully',
      startedAt: new Date().toISOString(),
    });

    // Run the scrape in the background
    try {
      const result = await runScrapeAll();
      lastScrapeResult = result;
      lastScrapeTime = new Date().toISOString();
      console.log('[Cron] Scrape completed:', JSON.stringify(result));
    } catch (err) {
      console.error('[Cron] Scrape failed:', err.message);
      lastScrapeResult = { error: err.message };
      lastScrapeTime = new Date().toISOString();
    } finally {
      isRunning = false;
    }
  } catch (err) {
    isRunning = false;
    console.error('[Cron] Trigger error:', err.message);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

/**
 * POST /api/scrape/product/:id
 * Scrape a single tracked product on demand.
 */
router.post('/product/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const productId = parseInt(id, 10);

    if (isNaN(productId)) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }

    const result = await scrapeSingleProduct(productId);

    res.json({
      message: 'Product scraped successfully',
      price: result.priceData.price || result.priceData.priceAlt,
      stock: result.stockData.stock,
      stockStatus: result.stockData.stockStatus,
      loadTimeMs: result.loadTimeMs,
    });
  } catch (err) {
    console.error(`[Scrape] Single product error:`, err.message);
    res.status(500).json({ error: 'Scrape failed', details: err.message });
  }
});

/**
 * GET /api/scrape/status
 * Check if a scrape is currently running and when the last scrape happened.
 */
router.get('/status', (req, res) => {
  res.json({
    isRunning,
    lastScrapeTime,
    lastScrapeResult,
  });
});

module.exports = router;
