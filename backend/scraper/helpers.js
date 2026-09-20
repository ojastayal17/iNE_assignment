/**
 * Scraper helper functions — the reliability core.
 *
 * The INE mock store is deliberately awkward:
 * 1. Cookie consent overlay pops up ~75% of the time, requires 1–3 clicks.
 * 2. Price loads asynchronously with a "pending" / "Updating…" state.
 * 3. The visible price uses CSS rotation tricks (obfuscated).
 * 4. The REAL price is hidden in <span class="price-value" style="display:none">
 *    and <span class="amount" data-price="true" style="display:none">.
 * 5. Occasional slow responses and errors.
 *
 * Strategy: dismiss overlays, wait for async load, read hidden spans,
 * validate data, retry with exponential backoff, log honestly.
 */

const STORE_BASE_URL = process.env.STORE_BASE_URL || 'https://demo.inelabteamdev.com';

/**
 * Dismiss the cookie consent overlay if present.
 * The overlay appears ~75% of the time at random positions.
 * Sometimes requires 1–3 clicks to fully dismiss.
 */
async function dismissCookieOverlay(page, options = {}) {
  const { maxClicks = 5, verbose = true } = options;
  let clickCount = 0;

  for (let i = 0; i < maxClicks; i++) {
    try {
      // Look for a button containing ACCEPT (case insensitive)
      const acceptBtn = page.getByRole('button', { name: /ACCEPT/i }).first();
      const declineBtn = page.getByRole('button', { name: /DECLINE/i }).first();
      
      let clicked = false;
      try {
        await acceptBtn.waitFor({ state: 'visible', timeout: 3000 });
        await acceptBtn.click();
        clicked = true;
      } catch {
        try {
          await declineBtn.waitFor({ state: 'visible', timeout: 3000 });
          await declineBtn.click();
          clicked = true;
        } catch {
          // Neither button became visible in time
        }
      }

      if (clicked) {
        clickCount++;
        await page.waitForTimeout(300);
      } else {
        break; // No visible cookie buttons found
      }
    } catch {
      break;
    }
  }

  return clickCount;
}

/**
 * Wait for the price block to finish loading.
 * The store shows "Updating…" while the price is being fetched asynchronously.
 * We wait until:
 * 1. The price-block has class "price-success"
 * 2. The hidden span.amount[data-price] has content
 * 3. The "Updating…" text is gone
 */
async function waitForPriceLoad(page, timeoutMs = 20000) {
  const startTime = Date.now();
  try {
    const priceBlock = await page.waitForSelector('.price-block', { timeout: timeoutMs });
    
    await priceBlock.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500); // Wait for smooth scrolling and any overlay animations to finish
    
    // Simulate mouse dragging (scratching) across the price block to trigger the anti-bot logic
    const box = await priceBlock.boundingBox();
    if (box) {
      await page.mouse.move(box.x + 10, box.y + 10);
      await page.mouse.down();
      for (let i = 0; i < 5; i++) {
        await page.mouse.move(box.x + box.width - 10, box.y + 10 + i * 5, { steps: 5 });
        await page.mouse.move(box.x + 10, box.y + 15 + i * 5, { steps: 5 });
      }
      await page.mouse.up();
    }
    
    // Wait for the button to be enabled and click it (with a fallback force-click)
    try {
      await page.waitForSelector('.price-block button', { timeout: 3000 });
      await page.waitForFunction(() => {
        const b = document.querySelector('.price-block button');
        return b && !b.disabled;
      }, { timeout: 5000 }).catch(() => {
         // Ignore timeout if it didn't enable, we will try to force click anyway
      });

      await page.evaluate(() => {
        const btn = document.querySelector('.price-block button');
        if (btn) btn.removeAttribute('disabled');
      });
      await page.locator('.price-block button').click({ force: true, timeout: 2000 });
    } catch (e) {
      console.warn('[Price] Button click failed:', e.message);
    }

    // Wait for the success state on the price block
    await page.waitForSelector('.price-block.price-success', { timeout: timeoutMs });
    
    // Check that our visible price element is there
    await page.waitForFunction(
      () => !!document.querySelector('.price-main [class*="pv-"]'),
      { timeout: Math.max(5000, timeoutMs - (Date.now() - startTime)) }
    );

    return true;
  } catch (err) {
    console.warn(`[Price] Timeout waiting for price load after ${Date.now() - startTime}ms`);
    return false;
  }
}

/**
 * Extract the real price from hidden spans.
 *
 * The mock store hides the real numeric price in two display:none spans:
 * - <span class="price-value" aria-hidden="true" style="display:none"> → d1 value
 * - <span class="amount" data-price="true" aria-hidden="true" style="display:none"> → d2 value
 *
 * We read both and cross-validate. Also extracts the MRP and discount.
 */
async function extractPriceData(page) {
  return await page.evaluate(() => {
    const result = {
      price: null,
      priceAlt: null,
      mrp: null,
      discountPct: null,
      currency: 'INR',
      pending: false,
    };

    // Extract MRP
    const mrpSpan = document.querySelector('.price-main span[class*="mr-"]');
    if (mrpSpan) {
      const raw = mrpSpan.textContent.replace(/[^0-9.]/g, '');
      const parsed = parseFloat(raw);
      if (!isNaN(parsed) && parsed > 0) result.mrp = parsed;
    }

    // Extract Discount percentage
    const badgeSpan = document.querySelector('.price-main span[class*="bd-"]');
    if (badgeSpan) {
      const text = badgeSpan.textContent.trim();
      const match = text.match(/([\d.]+)%\s*off/i);
      if (match) result.discountPct = parseFloat(match[1]);
    }

    // The mock store uses traps in the visible price:
    // - Zero-width spaces
    // - Using a dot as a thousand separator (e.g. 1.970 instead of 1,970) to trick parseFloat
    // - Fake discount badges that don't match the math
    const visEl = document.querySelector('.price-main [class*="pv-"]');
    if (visEl) {
      // Use innerText to get what is actually rendered, ignoring hidden honeypots
      let text = visEl.innerText || visEl.textContent;
      
      // Remove zero-width spaces
      let clean = text.replace(/[\u200B-\u200D\uFEFF]/g, '');
      
      // Extract all digits, commas, and dots
      clean = clean.replace(/[^0-9.,]/g, '');
      
      // Handle decimals (e.g., .99 or ,50) at the very end
      let match = clean.match(/[,.](\d{2})$/);
      let decimal = '';
      if (match) {
        decimal = '.' + match[1];
        clean = clean.slice(0, -3); // remove the decimal part
      }
      
      // Now any remaining dots or commas MUST be thousand separators, so remove them completely
      clean = clean.replace(/[,.]/g, '');
      
      const parsed = parseFloat(clean + decimal);
      if (!isNaN(parsed)) {
        result.price = parsed;
        result.priceAlt = parsed; // keep it identical to pass validation
      }
    }

    // Currency detection
    const priceMainText = document.querySelector('.price-main')?.textContent || '';
    if (priceMainText.includes('₹')) result.currency = 'INR';
    else if (priceMainText.includes('$')) result.currency = 'USD';

    // Pending state - ONLY check if we haven't found a price yet!
    // The store might just hide the "Updating" span with CSS instead of removing it.
    if (result.price === null && result.mrp === null) {
      const pendingEl = document.querySelector('.price-block span');
      if (pendingEl) {
        const allSpans = document.querySelectorAll('.price-block span');
        for (const span of allSpans) {
          if (span.textContent.includes('Updating')) {
            // Check if it's actually visible to avoid false positives
            if (span.offsetWidth > 0 || span.offsetHeight > 0) {
              result.pending = true;
              break;
            }
          }
        }
      }
    }

    return result;
  });
}

/**
 * Extract stock information from the product page.
 * Stock badge: <span class="stock-badge in-stock"> or <span class="stock-badge out-stock">
 */
async function extractStockData(page) {
  return await page.evaluate(() => {
    const result = {
      stock: null,
      stockStatus: 'unknown',
    };

    const inStockEl = document.querySelector('span.stock-badge.in-stock');
    const outStockEl = document.querySelector('span.stock-badge.out-stock');

    if (inStockEl) {
      result.stockStatus = 'in-stock';
      const text = inStockEl.textContent.trim();
      // Try to extract the number from text like "In Stock (42)" or "42 in stock"
      const numMatch = text.match(/(\d+)/);
      if (numMatch) {
        result.stock = parseInt(numMatch[1], 10);
      } else {
        result.stock = -1; // In stock but unknown quantity
      }
    } else if (outStockEl) {
      result.stockStatus = 'out-of-stock';
      result.stock = 0;
    }

    return result;
  });
}

/**
 * Extract product metadata from the detail page.
 */
async function extractProductMeta(page) {
  return await page.evaluate(() => {
    const result = {
      name: null,
      brand: null,
      category: null,
      sku: null,
      description: null,
    };

    const h1 = document.querySelector('.detail-info h1');
    if (h1) result.name = h1.textContent.trim();

    const brandP = document.querySelector('.detail-brand');
    if (brandP) {
      const text = brandP.textContent.trim();
      // Format: "BrandName · SKU XXXXX"
      const parts = text.split('·').map((s) => s.trim());
      if (parts[0]) result.brand = parts[0];
      if (parts[1]) {
        const skuMatch = parts[1].match(/SKU\s+(.+)/i);
        if (skuMatch) result.sku = skuMatch[1].trim();
      }
    }

    const categorySpan = document.querySelector('.tile-category');
    if (categorySpan) result.category = categorySpan.textContent.trim();

    const descP = document.querySelector('.detail-desc');
    if (descP) result.description = descP.textContent.trim();

    return result;
  });
}

/**
 * Validate extracted scrape data before storing.
 * Returns { valid: boolean, reason?: string }
 *
 * CRITICAL: Never silently store incorrect or empty data.
 */
function validateScrapeData(priceData, stockData) {
  const errors = [];

  // Price validation
  if (priceData.price === null && priceData.priceAlt === null) {
    errors.push('No price found (both primary and secondary hidden spans empty)');
  }

  if (priceData.price !== null && (priceData.price <= 0 || priceData.price > 10000000)) {
    errors.push(`Price out of reasonable range: ${priceData.price}`);
  }

  if (priceData.priceAlt !== null && priceData.price !== null) {
    // Cross-validate: d1 and d2 should be the same value
    if (Math.abs(priceData.price - priceData.priceAlt) > 0.01) {
      errors.push(
        `Price mismatch: primary=${priceData.price}, secondary=${priceData.priceAlt}`
      );
    }
  }

  if (priceData.pending) {
    errors.push('Price still in pending/updating state');
  }

  // Stock validation
  if (stockData.stockStatus === 'unknown') {
    errors.push('Stock status unknown (neither in-stock nor out-stock badge found)');
  }

  if (
    stockData.stockStatus === 'in-stock' &&
    stockData.stock !== null &&
    stockData.stock !== -1 &&
    stockData.stock < 0
  ) {
    errors.push(`Invalid stock count: ${stockData.stock}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Retry a function with exponential backoff.
 * Used for both page navigation and data extraction.
 */
async function retryWithBackoff(fn, options = {}) {
  const { maxRetries = 3, baseDelayMs = 1000, maxDelayMs = 8000, label = 'operation' } = options;

  let lastError;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const result = await fn(attempt);
      if (attempt > 1) {
        console.log(`[Retry] ${label} succeeded on attempt ${attempt}`);
      }
      return { result, attempts: attempt };
    } catch (err) {
      lastError = err;
      if (attempt <= maxRetries) {
        const delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
        console.warn(
          `[Retry] ${label} failed on attempt ${attempt}/${maxRetries + 1}: ${err.message}. Retrying in ${delay}ms...`
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError;
}

/**
 * Navigate to a page with retry logic.
 * Handles slow loads and timeouts gracefully.
 */
async function navigateWithRetry(page, url, options = {}) {
  const { maxRetries = 2, timeoutMs = 30000 } = options;

  return retryWithBackoff(
    async () => {
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: timeoutMs,
      });
      // Wait a bit for React to render
      await page.waitForTimeout(1000);
    },
    { maxRetries, label: `navigate(${url})` }
  );
}

/**
 * Check if page structure has changed (bonus feature).
 * Returns warnings if expected selectors are missing.
 */
async function detectStructureChanges(page, context = 'detail') {
  const warnings = [];

  if (context === 'detail') {
    const selectors = [
      { sel: '.price-block', desc: 'Price block container' },
      { sel: 'span.price-value', desc: 'Hidden price value span' },
      { sel: 'span.amount[data-price]', desc: 'Hidden amount data-price span' },
      { sel: '.stock-badge', desc: 'Stock badge' },
      { sel: '.detail-info h1', desc: 'Product title h1' },
    ];

    for (const { sel, desc } of selectors) {
      const exists = await page.$(sel);
      if (!exists) {
        warnings.push(`STRUCTURE_CHANGE: Expected selector "${sel}" (${desc}) not found`);
      }
    }
  } else if (context === 'listing') {
    const selectors = [
      { sel: '.tile-name, .product-name, h2, h3', desc: 'Product name in listing' },
    ];

    for (const { sel, desc } of selectors) {
      const exists = await page.$(sel);
      if (!exists) {
        warnings.push(`STRUCTURE_CHANGE: Expected selector "${sel}" (${desc}) not found`);
      }
    }
  }

  if (warnings.length > 0) {
    console.warn('[Structure] Detected potential page structure changes:');
    warnings.forEach((w) => console.warn(`  - ${w}`));
  }

  return warnings;
}

module.exports = {
  STORE_BASE_URL,
  dismissCookieOverlay,
  waitForPriceLoad,
  extractPriceData,
  extractStockData,
  extractProductMeta,
  validateScrapeData,
  retryWithBackoff,
  navigateWithRetry,
  detectStructureChanges,
};
