# Design Notes — INE Price Tracker

## How I Made the Scraping Reliable

The INE mock store is deliberately difficult to scrape. Here's how I handled each challenge:

### 1. JavaScript-Rendered Content (React SPA)

**Challenge**: The store is a React single-page application. The HTML source is just an empty `<div id="root">` — all content is rendered client-side via JavaScript.

**Decision**: Playwright (headless Chromium) was the only viable option. Lightweight HTTP fetching (axios, node-fetch) would return an empty page. This is not a "reach for a headless browser" situation — it's genuinely required.

**Trade-off**: Playwright adds memory overhead (~200–400MB per browser instance). On Render's free tier (512MB RAM), this requires careful resource management — I reuse a single browser instance and process products sequentially rather than in parallel.

### 2. Cookie Consent Overlay

**Challenge**: A cookie consent overlay appears ~75% of the time, positioned randomly (top, bottom, or center). It sometimes requires 1–3 clicks to dismiss.

**Solution**: After every page navigation, I check for `.cookie-overlay` and click Accept/Decline buttons in a loop (up to 5 attempts). I handle both `aria-label` selectors and generic button fallbacks. A 300ms wait between clicks allows the animation to complete.

### 3. Asynchronous Price Loading

**Challenge**: Prices don't render immediately. The page shows "Updating…" while fetching the price asynchronously, with a deliberate delay.

**Solution**: I use Playwright's `waitForFunction()` to wait until:
- The hidden `span.amount[data-price]` element contains a non-empty, non-zero value
- The "Updating…" pending indicator is gone
- Timeout is 20 seconds per product

### 4. Price Obfuscation

**Challenge**: The visually displayed price uses CSS rotation tricks (`transform: rotate(...)`) that make direct text extraction unreliable. The price shown to the eye isn't straightforward to parse from the DOM.

**Solution**: I discovered that the store hides **clean numeric values** in two `display:none` spans:
- `span.price-value` (primary, contains the d1 value)
- `span.amount[data-price="true"]` (secondary, contains the d2 value)

I read from these hidden spans instead of trying to parse the visually rendered price. I also **cross-validate** both values — if they disagree, I log a warning and flag the data as suspicious.

### 5. Slow and Failed Responses

**Challenge**: The store deliberately returns slow responses and occasional errors.

**Solution**: Exponential backoff retry strategy:
- Up to 3 retries per product (4 total attempts)
- Delays: 1s → 2s → 4s (capped at 8s)
- 30-second page load timeout
- Navigation retry on timeout

### 6. Data Validation (Never Store Bad Data)

Before storing any scraped data, I validate:
- Price is a positive number (not NaN, not 0, not >10M)
- Primary and secondary price values match (cross-validation)
- Price is not still in "pending" state
- Stock is a non-negative integer or explicit "Out of stock"
- Stock badge selector exists (in-stock or out-of-stock)

**If validation fails, the data is NOT stored** — instead, the scrape is logged as "failed" with the specific validation error message.

### 7. Honest Logging

Every scrape attempt is recorded with:
- Timestamp
- Status: `success`, `retried` (succeeded after retry), or `failed`
- Number of attempts
- Duration in milliseconds
- Error message (for failures)

Failures are never hidden. The frontend displays them prominently in a color-coded log table.

## Trade-offs

| Decision | Trade-off |
|----------|-----------|
| **Playwright** over HTTP fetching | Higher memory usage, but the SPA architecture makes it the only working option |
| **Sequential** product scraping | Slower but avoids memory exhaustion on Render free tier (512MB) |
| **Shared browser instance** | Faster (no cold start per scrape) but one crash could affect all products |
| **Read hidden spans** vs. parse visible text | More reliable but tightly coupled to current store implementation |
| **External cron** (cron-job.org) | Required because Render free tier sleeps after 15 min of inactivity |
| **Docker deployment** | Larger build but guarantees Playwright's Chromium dependencies are available |

## What AI Got Wrong on the First Attempt

1. **Initial assumption: lightweight HTTP would work**. The AI initially suggested checking whether HTTP fetching could work. After inspecting the page source and finding only `<div id="root">` with a React bundle, it was clear that Playwright was mandatory, not optional.

2. **Price extraction from visible text**. The AI's first instinct was to extract price from the visually rendered text. However, analyzing the minified JS bundle revealed CSS rotation obfuscation on the visible price. The correct approach was to read from the hidden `span.price-value` and `span.amount[data-price]` elements.

3. **Cookie overlay handling**. The first attempt used a simple "check once and click" pattern. However, the store sometimes requires 2–3 clicks because the overlay's dismiss counter (tracked in `useRef`) starts at a random value between 1 and 3. The corrected approach loops and retries clicks.

4. **Single retry vs. exponential backoff**. The initial approach used a simple single retry. This wasn't robust enough for the store's intentionally slow responses (which can take 10+ seconds). Switching to exponential backoff with 3 retries significantly improved reliability.

5. **Data validation was initially too lax**. The first version would store price=0 or price=NaN on failure. Adding strict validation (positive number, cross-validation between d1 and d2, pending state check) prevented bad data from entering the database.

## Architecture Decisions

- **React + Vite** for the frontend: fast dev experience, modern tooling, easy Vercel deployment
- **Express.js** for the backend: lightweight, widely supported on Render, good Playwright integration
- **Supabase** for the database: free PostgreSQL, good JS client library, no server management
- **Recharts** for charts: React-native chart library, responsive, good dark mode support
- **Docker** for Render deployment: guarantees Playwright's system-level dependencies (Chromium, fonts, etc.) are available
