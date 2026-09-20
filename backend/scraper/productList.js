/**
 * Product listing page scraper.
 * Navigates to the store homepage, extracts all product tiles,
 * and returns them for search/catalog purposes.
 */

const {
  STORE_BASE_URL,
  dismissCookieOverlay,
  navigateWithRetry,
  retryWithBackoff,
} = require('./helpers');
const { getBrowser, createContext } = require('./browser');

/**
 * Scrape the product listing from the store homepage.
 * Returns an array of { storeProductId, name, brand, category, url }.
 */
async function scrapeProductListing() {
  const browser = await getBrowser();
  const context = await createContext(browser);
  const page = await context.newPage();

  try {
    console.log('[Listing] Navigating to store homepage...');
    
    // Inject pushState override BEFORE navigation so it's active on the page
    await page.addInitScript(() => {
      window.__interceptedIds = [];
      const originalPushState = history.pushState;
      history.pushState = function(...args) {
        const url = args[2];
        const match = url?.match(/\/product\/(\d+)/);
        if (match) window.__interceptedIds.push(parseInt(match[1], 10));
        // Don't call original to prevent actual navigation
      };
    });

    await navigateWithRetry(page, STORE_BASE_URL);

    // Dismiss cookie overlay if present
    await dismissCookieOverlay(page);

    // Wait for product grid to render
    await page.waitForSelector('main', { timeout: 15000 });
    await page.waitForTimeout(2000); // Extra time for React hydration

    // Extract products from the listing page
    const { result: products } = await retryWithBackoff(
      async () => {
        const items = await page.evaluate(() => {
          const products = [];
          const tiles = document.querySelectorAll('.tile');

          for (const tile of tiles) {
            const btn = tile.querySelector('.tile-cta');
            
            // Clear intercepted ID before click
            window.__interceptedIds = [];
            if (btn) btn.click();
            
            // Grab the ID it tried to navigate to
            const id = window.__interceptedIds[0];

            if (id) {
              const nameEl = tile.querySelector('.tile-name, .product-name, h2, h3');
              const categoryEl = tile.querySelector('.tile-category, .category, small');
              const brandEl = tile.querySelector('.tile-brand, .brand');
              
              products.push({
                storeProductId: id,
                name: nameEl ? nameEl.textContent.trim() : '',
                brand: brandEl ? brandEl.textContent.trim() : '',
                category: categoryEl ? categoryEl.textContent.trim() : '',
                url: `${window.location.origin}/product/${id}`,
              });
            }
          }

          return products;
        });

        if (items.length === 0) {
          throw new Error('No products found on listing page — possible structure change or load failure');
        }

        return items;
      },
      { maxRetries: 2, label: 'extractProductListing' }
    );

    console.log(`[Listing] Found ${products.length} products`);
    return products;
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  }
}

module.exports = { scrapeProductListing };
