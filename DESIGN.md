# Architectural & Design Notes

This document provides technical design rationales, reliability strategies, and an authentic account of engineering challenges and real issues encountered during development of the INE Store Price Tracker.

---

## 1. Scraping Strategy: Why Playwright Was Selected Over Pure HTTP

The assignment specifies:
> *"Prefer lightweight HTTP fetching + HTML parsing if possible. Use Playwright only if the page genuinely requires JavaScript rendering."*

During initial reconnaissance, we reverse-engineered the client bundle (`index-B9UiQq4X.js`) to evaluate whether pure HTTP requests could be used:
1. **Catalog & Search**: Lightweight HTTP fetching is used for catalog browsing (`/api/catalog`) and product metadata (`/api/product/:id`).
2. **Price & Stock Gating**: The mock store specifically implements an interactive anti-scraping system:
   - **Interaction Barrier**: An interaction controller `Ar` requires cursor movement (>= 8 distinct coordinates with >= 40ms interval) and dwell time (>= 600ms) over `.price-block`. Until satisfied, the "Reveal price" button remains disabled.
   - **Environment Attestation**: `/api/session` validates an attestation payload containing HTML5 Canvas 2D gradient hash, WebGL renderer debug info, hardware concurrency, screen dimensions, frame delta array from `requestAnimationFrame`, and trusted user event flags.
   - **Cryptographic Challenge**: The client must solve a Proof-of-Work hash search, execute an encrypted WebAssembly binary module, and derive an XOR key to decrypt `/api/products/:id/price`.
   - **DOM Decoys**: The rendered DOM injects hidden honey-pot elements (`<span class="price-value" style="display:none">` and `<span class="amount" data-price="true">`) with randomized fake prices to mislead basic scrapers.

Because executing the WebAssembly binary, generating authentic canvas/WebGL environments, and satisfying the mouse movement and dwell barrier genuinely requires a browser engine, **Playwright with Chromium** was selected.

---

## 2. Retry Strategy & Handling Transient Failures

The INE mock storefront deliberately injects transient delays, click-dropping jitter, and simulated errors:
1. **Anti-Bot Click Jitter (`Xn`)**:
   - The storefront wraps the "Reveal price" click in `Xn()`, which randomly drops 17.5% of clicks and delays 17.5% by 900ms.
   - **Solution**: The scraper verifies state transition into `.spinner`, `.price-success`, or `.price-error`. If no state change occurs within 1.8s, it automatically retries clicking up to 6 times.
2. **Delayed Cookie Overlay**:
   - `<div class="cookie-overlay">` pops up between 1.5s and 5.0s after page load, intercepting all clicks. Furthermore, the store's code requires 1 to 3 clicks on "Accept" to dismiss (`--i.current; i.current <= 0`).
   - **Solution**: Proactive detection loop clicks "Accept" repeatedly, falling back to clean DOM removal if pointer events remain blocked.
3. **Transient Session 401s (`challenge_failed`)**:
   - The storefront server intermittently returns `401 Unauthorized` on `/api/session` to simulate network/upstream glitches. The UI responds by displaying `.price-error` with a "Try again" button.
   - **Solution**: The scraper monitors `.price-error` and triggers "Try again" or retries the entire page scrape with exponential backoff and jitter (`(2^(attempt-1) * 1000ms) + random(500ms)`).

---

## 3. Data Integrity & Anti-Corruption Rules

To guarantee that invalid or empty data is never saved:
1. **Gatekeeper Validation (`validator.js`)**:
   - `price` must be a positive finite number (> 0). Null, undefined, NaN, or non-positive values are rejected.
   - `stock` must be a non-negative integer (>= 0).
   - Domain check ensures the scraper operates strictly on `demo.inelabteamdev.com`.
2. **Decoy Suppression**:
   - The scraper explicitly skips `.price-value`, `[data-price="true"]`, and elements with `display: none` or `visibility: hidden`.
   - Strips zero-width spaces (`\u200B`) introduced by split formatting.
3. **Preservation of Valid Data on Failure**:
   - When a scrape attempt fails after all retries, the previous `current_price` and `current_stock` remain untouched.
   - The failure is recorded in `scrape_logs` with the exact error message and duration.
   - **Zero fake records are inserted into `price_history`**. Price history is strictly an append-only log of validated, successful scrapes.

---

## 4. Scheduling & Overcoming Render Free-Tier Sleep

Because Render free tier web services spin down after 15 minutes of inactivity:
- An always-running background loop (`setInterval` or `node-cron`) would be killed when Render sleeps.
- **Solution**: We expose an authenticated REST endpoint:
  ```http
  POST /api/cron/scrape
  Header: X-Cron-Secret: <CRON_SECRET>
  ```
- **External Cron**: An external monitoring service such as [cron-job.org](https://cron-job.org/) makes an HTTP request every 2 hours.
- **Wake-up + Execution**: The incoming HTTP request automatically wakes the Render container, executes the batch scrape across all tracked products, logs results, and returns a JSON summary.

---

## 5. Authentic Development Mistakes & Corrections

During development, several real obstacles were encountered and diagnosed:

### Issue 1: Pure HTTP Challenge Solver Blocked by Attestation Requirements
- **Initial Assumption**: We thought we could solve the challenge purely via HTTP in Node.js by executing the WebAssembly binary and computing the Proof of Work.
- **What Happened**: `/api/session` consistently rejected requests with `401 Unauthorized`.
- **Root Cause**: The mock store backend validates complex browser attestation parameters: 2D canvas gradient rendering hashes, WebGL vendor/renderer strings, and exact frame delta distributions from `requestAnimationFrame`.
- **Correction**: Selected Playwright Chromium to natively satisfy all hardware, rendering, and interaction constraints.

### Issue 2: Scraper Timeout Caused by Delayed Cookie Consent Overlay
- **What Happened**: Our first Playwright script timed out attempting to click "Reveal price".
- **Root Cause**: Reading `app_code.js` revealed `Yr()`, which intentionally schedules a `<div class="cookie-overlay">` to appear with a random delay between 1500ms and 5000ms. Because it covered the entire screen, it intercepted clicks intended for the "Reveal price" button. Moreover, `Jr()` required up to 3 clicks to dismiss.
- **Correction**: Built an automated handler that proactively detects the overlay, clicks "Accept" in a loop, and removes the overlay element if it remains present.

### Issue 3: Synthetic Click Jitter Dropping User Clicks
- **What Happened**: Even after resolving the cookie banner, button clicks occasionally failed to transition the UI out of the idle state.
- **Root Cause**: The storefront code contains a function `Xn(e)`:
  ```javascript
  function Xn(e) {
    return () => {
      if (Math.random() < 0.35) {
        if (Math.random() < 0.5) return; // 17.5% drop
        window.setTimeout(e, 900);      // 17.5% delay
        return;
      }
      e();
    };
  }
  ```
  In 17.5% of cases, clicks are discarded entirely.
- **Correction**: Implemented click verification that checks for state transitions into `.spinner` or `.price-success`, automatically re-clicking if dropped.

### Issue 4: Catalog Search Paging Cap
- **What Happened**: Searching for SKU `NOR-10001` initially failed in unit tests.
- **Root Cause**: Requesting `/api/catalog?page=1&pageSize=1000` silently returned only 60 items because the backend caps `pageSize` at 60.
- **Correction**: Added direct SKU/product ID resolution that extracts numeric IDs and fetches `/api/product/:id` directly, combined with multi-page catalog caching.
