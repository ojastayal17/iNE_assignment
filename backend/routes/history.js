/**
 * Price history and scrape log API routes.
 * Provides historical data for charts and log tables.
 */

const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

/**
 * GET /api/history/:productId
 * Get price & stock history for a tracked product.
 * Query params: limit (default 100), offset (default 0)
 */
router.get('/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const offset = parseInt(req.query.offset) || 0;

    const { data, error, count } = await supabase
      .from('price_history')
      .select('*', { count: 'exact' })
      .eq('tracked_product_id', productId)
      .order('scraped_at', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch history', details: error.message });
    }

    // Also get summary stats
    const { data: stats } = await supabase
      .from('price_history')
      .select('price')
      .eq('tracked_product_id', productId);

    const prices = (stats || []).map((s) => s.price).filter((p) => p !== null);
    const summary = prices.length > 0 ? {
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
      avgPrice: parseFloat((prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2)),
      totalDataPoints: prices.length,
    } : null;

    res.json({
      history: data || [],
      total: count || 0,
      summary,
    });
  } catch (err) {
    console.error('[History] Error:', err.message);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

/**
 * GET /api/history/logs/:productId
 * Get scrape log for a tracked product.
 * Shows every scrape attempt with timestamp and outcome.
 */
router.get('/logs/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;

    const { data, error, count } = await supabase
      .from('scrape_logs')
      .select('*', { count: 'exact' })
      .eq('tracked_product_id', productId)
      .order('scraped_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch logs', details: error.message });
    }

    // Calculate success rate
    const { data: allLogs } = await supabase
      .from('scrape_logs')
      .select('status')
      .eq('tracked_product_id', productId);

    const total = (allLogs || []).length;
    const successes = (allLogs || []).filter((l) => l.status === 'success' || l.status === 'retried').length;
    const successRate = total > 0 ? parseFloat(((successes / total) * 100).toFixed(1)) : null;

    res.json({
      logs: data || [],
      total: count || 0,
      successRate,
    });
  } catch (err) {
    console.error('[Logs] Error:', err.message);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

module.exports = router;
