# Design Notes: Scraping Reliability & Trade-offs

## How Scraping was Made Reliable
1. **Sequential Processing with Delays**: Instead of firing concurrent requests (`Promise.all`), the orchestrator processes products one by one with a deliberate 1.5-second delay between each. This ensures we don't overwhelm the target store and avoids triggering basic rate-limiters.
2. **Exponential Backoff & Retries**: Network requests can be flaky. All scrape operations are wrapped in a `retryWithBackoff` utility. If a page fails to load or a selector isn't found in time, the system will wait and try again up to 2 times, significantly reducing transient failures.
3. **Robust Locators**: We avoided relying on deeply nested, fragile CSS selectors (like `div > span > b`). Instead, we used more resilient methods such as semantic text matching or broader class names, which are less likely to break when the target site's layout slightly changes.
4. **Comprehensive Auditing**: Every scrape attempt, successful or failed, is logged to the `scrape_logs` table. This provides full observability into failure rates, execution times, and specific error messages, making it much easier to debug issues when a site changes its DOM structure.

## Trade-offs Made
- **Speed vs. Stability (Sequential execution)**: We chose to scrape sequentially. *Trade-off*: A full scrape cycle takes linearly longer as the catalog grows. However, the *benefit* is vastly reduced memory usage (fitting well within free-tier limits of hosts like Render) and a much lower risk of IP blocking.
- **Shared Browser Context vs. Isolated Contexts**: We reuse a single Playwright browser context for an entire batch run. *Trade-off*: We lose total isolation between pages (cookies/cache are shared). *Benefit*: Drastically lower CPU overhead and faster page load times, which is acceptable since we are performing unauthenticated public data scraping.

## AI Tools: Mistakes & Corrections
During the initial development, the AI assistance (e.g., code generation models) made a few common missteps that had to be corrected:
1. **The "Concurrency" Trap**: The AI initially suggested using `Promise.all(urls.map(scrape))` to fetch all products at once. While this looks elegant in standard Node.js API fetching, doing this with a headless browser immediately spikes memory, crashing the Node process. I had to manually refactor the logic to a standard `for...of` loop with a sleep delay.
2. **Fragile Selectors**: The AI heavily relied on exact CSS paths based on a provided HTML snippet. When tested against slightly different product variants, the selectors failed. I corrected this by overriding the AI's suggestions and utilizing Playwright's more resilient text-based and regex-based locators.
3. **Missing Graceful Exits**: Early AI-generated code didn't properly handle `browser.close()` in a `finally` block when an unhandled exception occurred mid-scrape. This caused zombie Chromium processes to stay alive, leaking memory over time. I added robust `try/finally` blocks to guarantee cleanup.
