/**
 * Product detail page scraper.
 * Navigates to a specific product page, extracts price, stock, and metadata.
 * This is where the main scraping difficulty lies.
 */

const {
  STORE_BASE_URL,
  dismissCookieOverlay,
  waitForPriceLoad,
  extractPriceData,
  extractStockData,
  extractProductMeta,
  validateScrapeData,
  navigateWithRetry,
  detectStructureChanges,
} = require('./helpers');
const { getBrowser, createContext } = require('./browser');

/**
 * Scrape a single product's detail page.
 *
 * @param {number} storeProductId - The product ID from the store URL
 * @param {object} options - Options like { context, verbose }
 * @returns {{ priceData, stockData, meta, structureWarnings, loadTimeMs }}
 */
async function scrapeProductDetail(storeProductId, options = {}) {
  const { context: existingContext, verbose = true } = options;
  const url = `${STORE_BASE_URL}/product/${storeProductId}`;

  const browser = await getBrowser();
  const context = existingContext || (await createContext(browser));
  const page = await context.newPage();
  const startTime = Date.now();

  try {
    if (verbose) console.log(`[Detail] Scraping product ${storeProductId}...`);

    // Step 1: Navigate to the product page
    await navigateWithRetry(page, url, { maxRetries: 2, timeoutMs: 30000 });

    // Step 2: Dismiss cookie overlay (appears ~75% of the time)
    const cookieClicks = await dismissCookieOverlay(page, { verbose });

    // Step 3: Wait for the price to load (async with pending state, passes anti-bot challenge)
    const priceLoaded = await waitForPriceLoad(page, 20000);
    if (!priceLoaded) {
      throw new Error('Price did not load within timeout — likely a slow response or server error');
    }

    // Step 4: Check for page structure changes (now that the price DOM is injected)
    const structureWarnings = await detectStructureChanges(page, 'detail');

    // Step 5: Extract price data from the visible price block
    const priceData = await extractPriceData(page);

    // Step 6: Extract stock data
    const stockData = await extractStockData(page);

    // Step 7: Extract product metadata
    const meta = await extractProductMeta(page);

    // Step 8: Validate data before storing
    const validation = validateScrapeData(priceData, stockData);

    const loadTimeMs = Date.now() - startTime;

    if (!validation.valid) {
      const errMsg = validation.errors.join('; ');
      throw new Error(`Data validation failed: ${errMsg}`);
    }

    if (verbose) {
      console.log(
        `[Detail] Product ${storeProductId}: price=₹${priceData.price || priceData.priceAlt}, ` +
          `stock=${stockData.stock} (${stockData.stockStatus}), ` +
          `took ${loadTimeMs}ms` +
          (cookieClicks > 0 ? `, dismissed cookie (${cookieClicks} clicks)` : '')
      );
    }

    return {
      priceData,
      stockData,
      meta,
      structureWarnings,
      loadTimeMs,
    };
  } finally {
    await page.close().catch(() => {});
    if (!existingContext) {
      await context.close().catch(() => {});
    }
  }
}

module.exports = { scrapeProductDetail };
