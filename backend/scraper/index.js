/**
 * Scraper orchestrator.
 * Manages the full scrape cycle: iterates through tracked products,
 * scrapes each one, stores results, and logs outcomes.
 *
 * Products are processed sequentially to:
 * 1. Avoid overwhelming the mock store
 * 2. Stay within Render free tier memory limits
 * 3. Make debugging easier
 */

const { getBrowser, createContext, closeBrowser } = require('./browser');
const { scrapeProductDetail } = require('./productDetail');
const { scrapeProductListing } = require('./productList');
const { retryWithBackoff } = require('./helpers');
const supabase = require('../config/supabase');

/**
 * Run a full scrape cycle for all tracked products.
 * This is triggered by the cron endpoint.
 */
async function runScrapeAll() {
  const startTime = Date.now();
  console.log('[Orchestrator] Starting full scrape cycle...');

  // Fetch all active tracked products
  const { data: trackedProducts, error: fetchError } = await supabase
    .from('tracked_products')
    .select('*')
    .eq('is_active', true)
    .order('id');

  if (fetchError) {
    console.error('[Orchestrator] Failed to fetch tracked products:', fetchError.message);
    throw fetchError;
  }

  if (!trackedProducts || trackedProducts.length === 0) {
    console.log('[Orchestrator] No tracked products found, skipping scrape');
    return { scraped: 0, succeeded: 0, failed: 0 };
  }

  console.log(`[Orchestrator] Found ${trackedProducts.length} tracked product(s)`);

  const results = {
    scraped: trackedProducts.length,
    succeeded: 0,
    failed: 0,
    details: [],
  };

  // Create a shared browser context for efficiency
  const browser = await getBrowser();
  const context = await createContext(browser);

  try {
    for (const product of trackedProducts) {
      const productStart = Date.now();
      let scrapeStatus = 'failed';
      let attempts = 1;
      let errorMessage = null;

      try {
        // Scrape with retry
        const { result, attempts: totalAttempts } = await retryWithBackoff(
          async (attempt) => {
            return await scrapeProductDetail(product.store_product_id, {
              context,
              verbose: true,
            });
          },
          {
            maxRetries: 2,
            baseDelayMs: 2000,
            label: `scrape-product-${product.store_product_id}`,
          }
        );

        attempts = totalAttempts;
        scrapeStatus = totalAttempts > 1 ? 'retried' : 'success';

        // Store price history
        const price = result.priceData.price || result.priceData.priceAlt;
        const { error: insertError } = await supabase.from('price_history').insert({
          tracked_product_id: product.id,
          price: price,
          mrp: result.priceData.mrp,
          discount_pct: result.priceData.discountPct,
          stock: result.stockData.stock,
          stock_status: result.stockData.stockStatus,
          currency: result.priceData.currency,
        });

        if (insertError) {
          throw new Error(`Failed to insert price history: ${insertError.message}`);
        }

        // Update product metadata if we got new data
        if (result.meta.name) {
          await supabase
            .from('tracked_products')
            .update({
              name: result.meta.name,
              brand: result.meta.brand || product.brand,
              category: result.meta.category || product.category,
              sku: result.meta.sku || product.sku,
              description: result.meta.description || product.description,
              updated_at: new Date().toISOString(),
            })
            .eq('id', product.id);
        }

        results.succeeded++;
        console.log(
          `[Orchestrator] ✓ Product ${product.store_product_id}: ₹${price} (${scrapeStatus})`
        );
      } catch (err) {
        scrapeStatus = 'failed';
        errorMessage = err.message;
        results.failed++;
        console.error(
          `[Orchestrator] ✗ Product ${product.store_product_id}: ${err.message}`
        );
      }

      // Always log the scrape attempt (honest logging)
      const durationMs = Date.now() - productStart;
      await supabase
        .from('scrape_logs')
        .insert({
          tracked_product_id: product.id,
          status: scrapeStatus,
          attempts,
          error_message: errorMessage,
          duration_ms: durationMs,
        })
        .then(({ error }) => {
          if (error) console.error('[Orchestrator] Failed to log scrape:', error.message);
        });

      results.details.push({
        productId: product.id,
        storeProductId: product.store_product_id,
        status: scrapeStatus,
        attempts,
        durationMs,
        error: errorMessage,
      });

      // Small delay between products to be nice to the store
      if (trackedProducts.indexOf(product) < trackedProducts.length - 1) {
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  } finally {
    await context.close().catch(() => {});
  }

  const totalDuration = Date.now() - startTime;
  console.log(
    `[Orchestrator] Scrape cycle complete: ${results.succeeded}/${results.scraped} succeeded, ` +
      `${results.failed} failed, took ${totalDuration}ms`
  );

  return results;
}

/**
 * Scrape a single product on demand (not part of the cron cycle).
 */
async function scrapeSingleProduct(trackedProductId) {
  const { data: product, error } = await supabase
    .from('tracked_products')
    .select('*')
    .eq('id', trackedProductId)
    .single();

  if (error || !product) {
    throw new Error(`Product not found: ${trackedProductId}`);
  }

  const productStart = Date.now();
  let scrapeStatus = 'failed';
  let attempts = 1;
  let errorMessage = null;
  let scrapeResult = null;

  try {
    const { result, attempts: totalAttempts } = await retryWithBackoff(
      async () => {
        return await scrapeProductDetail(product.store_product_id);
      },
      {
        maxRetries: 2,
        baseDelayMs: 2000,
        label: `scrape-single-${product.store_product_id}`,
      }
    );

    attempts = totalAttempts;
    scrapeStatus = totalAttempts > 1 ? 'retried' : 'success';
    scrapeResult = result;

    const price = result.priceData.price || result.priceData.priceAlt;
    await supabase.from('price_history').insert({
      tracked_product_id: product.id,
      price,
      mrp: result.priceData.mrp,
      discount_pct: result.priceData.discountPct,
      stock: result.stockData.stock,
      stock_status: result.stockData.stockStatus,
      currency: result.priceData.currency,
    });

    if (result.meta.name) {
      await supabase
        .from('tracked_products')
        .update({
          name: result.meta.name,
          brand: result.meta.brand || product.brand,
          category: result.meta.category || product.category,
          sku: result.meta.sku || product.sku,
          description: result.meta.description || product.description,
          updated_at: new Date().toISOString(),
        })
        .eq('id', product.id);
    }
  } catch (err) {
    errorMessage = err.message;
    throw err;
  } finally {
    const durationMs = Date.now() - productStart;
    await supabase
      .from('scrape_logs')
      .insert({
        tracked_product_id: product.id,
        status: scrapeStatus,
        attempts,
        error_message: errorMessage,
        duration_ms: durationMs,
      })
      .then(({ error }) => {
        if (error) console.error('[Orchestrator] Failed to log scrape:', error.message);
      });
  }

  return scrapeResult;
}

/**
 * Refresh the product catalog by scraping the listing page.
 */
async function refreshProductCatalog() {
  console.log('[Catalog] Refreshing product catalog from listing page...');

  const products = await scrapeProductListing();

  for (const product of products) {
    const { error } = await supabase
      .from('product_catalog')
      .upsert(
        {
          store_product_id: product.storeProductId,
          name: product.name,
          brand: product.brand || null,
          category: product.category || null,
          last_refreshed: new Date().toISOString(),
        },
        { onConflict: 'store_product_id' }
      );

    if (error) {
      console.error(`[Catalog] Failed to upsert product ${product.storeProductId}:`, error.message);
    }
  }

  console.log(`[Catalog] Catalog refreshed with ${products.length} products`);
  return products;
}

module.exports = { runScrapeAll, scrapeSingleProduct, refreshProductCatalog };
