/**
 * Product API routes.
 * Handles searching the product catalog, tracking/untracking products,
 * and listing all tracked products with their latest data.
 */

const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { refreshProductCatalog } = require('../scraper');

/**
 * GET /api/products/search?q=<query>
 * Search products by name (partial match). First checks the cached catalog,
 * refreshes it if stale (>24 hours).
 */
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.trim().length < 1) {
      return res.status(400).json({ error: 'Search query "q" is required (min 1 character)' });
    }

    const query = q.trim().toLowerCase();

    // Check if catalog exists and is reasonably fresh
    const { data: catalogItems, error: catalogError } = await supabase
      .from('product_catalog')
      .select('*')
      .order('store_product_id');

    if (catalogError) {
      return res.status(500).json({ error: 'Failed to query catalog', details: catalogError.message });
    }

    let products = catalogItems || [];

    // If catalog is empty or very stale, refresh it
    if (products.length === 0) {
      console.log('[Search] Catalog empty, refreshing from store...');
      try {
        await refreshProductCatalog();
        const { data: refreshed } = await supabase
          .from('product_catalog')
          .select('*')
          .order('store_product_id');
        products = refreshed || [];
      } catch (err) {
        console.error('[Search] Failed to refresh catalog:', err.message);
        // Continue with whatever we have
      }
    }

    // Filter products by search query
    const queryWords = query.split(/\s+/);
    let scoredProducts = products.map((p) => {
      const searchFields = [p.name, p.brand, p.category].filter(Boolean).join(' ').toLowerCase();
      // Only count words that are at least 2 chars to avoid matching 'a', '1', etc unless it's the only word
      const validWords = queryWords.length === 1 ? queryWords : queryWords.filter(w => w.length > 1);
      let score = validWords.reduce((acc, word) => acc + (searchFields.includes(word) ? 1 : 0), 0);
      
      // Bonus points for matching the start of the name, brand, or any word
      if (score > 0) {
        validWords.forEach((word) => {
          if (p.name.toLowerCase().startsWith(word)) {
            score += 10; // High bonus for starting with the word
          } else if (p.brand && p.brand.toLowerCase().startsWith(word)) {
            score += 5; // Medium bonus for brand starting with word
          }
          // Small bonus if any word inside the fields starts with the query
          if (searchFields.includes(` ${word}`)) {
            score += 2;
          }
        });
      }
      return { p, score };
    }).filter((item) => item.score > 0);

    scoredProducts.sort((a, b) => b.score - a.score);
    let filtered = scoredProducts.map(item => item.p);

    // If no matches found and catalog is older than 5 minutes, the store might have rotated products.
    // Do a synchronous refresh and try again.
    const isStale =
      products.length > 0 &&
      products.every((p) => {
        const refreshedAt = new Date(p.last_refreshed);
        return Date.now() - refreshedAt.getTime() > 5 * 60 * 1000; // 5 minutes
      });

    if (filtered.length === 0 && (products.length === 0 || isStale)) {
      console.log('[Search] No matches and catalog is stale/empty. Refreshing from store...');
      try {
        await refreshProductCatalog();
        const { data: refreshed } = await supabase
          .from('product_catalog')
          .select('*')
          .order('store_product_id');
        
        products = refreshed || [];
        
        // Try filtering again with new products
        let scoredProductsRefresh = products.map((p) => {
          const searchFields = [p.name, p.brand, p.category].filter(Boolean).join(' ').toLowerCase();
          const validWords = queryWords.length === 1 ? queryWords : queryWords.filter(w => w.length > 1);
          let score = validWords.reduce((acc, word) => acc + (searchFields.includes(word) ? 1 : 0), 0);
          
          if (score > 0) {
            validWords.forEach((word) => {
              if (p.name.toLowerCase().startsWith(word)) {
                score += 10;
              } else if (p.brand && p.brand.toLowerCase().startsWith(word)) {
                score += 5;
              }
              if (searchFields.includes(` ${word}`)) {
                score += 2;
              }
            });
          }
          return { p, score };
        }).filter((item) => item.score > 0);
        
        scoredProductsRefresh.sort((a, b) => b.score - a.score);
        filtered = scoredProductsRefresh.map(item => item.p);
      } catch (err) {
        console.error('[Search] Failed to refresh catalog:', err.message);
      }
    } else if (isStale) {
      // If we found matches but it's still stale, refresh in background for next time
      refreshProductCatalog().catch((err) =>
        console.error('[Search] Background catalog refresh failed:', err.message)
      );
    }

    // Check which products are already tracked
    const storeIds = filtered.map((p) => p.store_product_id);
    const { data: tracked } = await supabase
      .from('tracked_products')
      .select('store_product_id')
      .in('store_product_id', storeIds);

    const trackedIds = new Set((tracked || []).map((t) => t.store_product_id));

    const results = filtered.map((p) => ({
      ...p,
      isTracked: trackedIds.has(p.store_product_id),
    }));

    res.json({ products: results, total: results.length });
  } catch (err) {
    console.error('[Search] Error:', err.message);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

/**
 * GET /api/products/tracked
 * List all tracked products with their latest price, stock, and recent scrape status.
 */
router.get('/tracked', async (req, res) => {
  try {
    const { data: tracked, error } = await supabase
      .from('tracked_products')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch tracked products', details: error.message });
    }

    // For each tracked product, get the latest price and last scrape log
    const enriched = await Promise.all(
      (tracked || []).map(async (product) => {
        // Latest price
        const { data: latestPrice } = await supabase
          .from('price_history')
          .select('*')
          .eq('tracked_product_id', product.id)
          .order('scraped_at', { ascending: false })
          .limit(1)
          .single();

        // Latest scrape log
        const { data: latestLog } = await supabase
          .from('scrape_logs')
          .select('*')
          .eq('tracked_product_id', product.id)
          .order('scraped_at', { ascending: false })
          .limit(1)
          .single();

        // Price history count
        const { count: historyCount } = await supabase
          .from('price_history')
          .select('*', { count: 'exact', head: true })
          .eq('tracked_product_id', product.id);

        // Recent prices for sparkline (last 10)
        const { data: recentPrices } = await supabase
          .from('price_history')
          .select('price, scraped_at')
          .eq('tracked_product_id', product.id)
          .order('scraped_at', { ascending: false })
          .limit(10);

        return {
          ...product,
          latestPrice,
          latestLog,
          historyCount: historyCount || 0,
          recentPrices: (recentPrices || []).reverse(),
        };
      })
    );

    res.json({ products: enriched });
  } catch (err) {
    console.error('[Tracked] Error:', err.message);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

/**
 * POST /api/products/track
 * Add a product to tracking.
 * Body: { storeProductId, name, brand?, category? }
 */
router.post('/track', async (req, res) => {
  try {
    const { storeProductId, name, brand, category } = req.body;

    if (!storeProductId || !name) {
      return res.status(400).json({ error: 'storeProductId and name are required' });
    }

    // Check if already tracked
    const { data: existing } = await supabase
      .from('tracked_products')
      .select('*')
      .eq('store_product_id', storeProductId)
      .single();

    if (existing) {
      if (!existing.is_active) {
        // Reactivate
        await supabase
          .from('tracked_products')
          .update({ is_active: true, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
        return res.json({ product: { ...existing, is_active: true }, message: 'Product re-activated for tracking' });
      }
      return res.json({ product: existing, message: 'Product already tracked' });
    }

    // Insert new tracked product
    const { data: inserted, error } = await supabase
      .from('tracked_products')
      .insert({
        store_product_id: storeProductId,
        name,
        brand: brand || null,
        category: category || null,
      })
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: 'Failed to track product', details: error.message });
    }

    res.status(201).json({ product: inserted, message: 'Product tracked successfully' });
  } catch (err) {
    console.error('[Track] Error:', err.message);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

/**
 * DELETE /api/products/track/:id
 * Remove a product from tracking (soft delete — sets is_active to false).
 */
router.delete('/track/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('tracked_products')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      return res.status(500).json({ error: 'Failed to untrack product', details: error.message });
    }

    res.json({ message: 'Product untracked successfully' });
  } catch (err) {
    console.error('[Untrack] Error:', err.message);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

/**
 * GET /api/products/:id
 * Get a single tracked product with full details.
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: product, error } = await supabase
      .from('tracked_products')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ product });
  } catch (err) {
    console.error('[Product] Error:', err.message);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

module.exports = router;
