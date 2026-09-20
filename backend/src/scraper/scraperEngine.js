const { getBrowser, closeBrowser } = require('./browserPool');
const { decryptPayload } = require('./decryptor');
const { validateScrapedData } = require('./validator');
const config = require('../config/env');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Prevent a scrape attempt from hanging indefinitely.
 */
function withTimeout(
  promise,
  ms,
  message = 'Scrape attempt timed out'
) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(message)), ms)
    )
  ]);
}

/**
 * Executes a single scrape attempt for a product on the INE mock store
 */
async function scrapeAttempt(productId, isHeaded = false) {
  const baseUrl = config.mockStoreBaseUrl;
  const targetUrl = `${baseUrl}/product/${productId}`;

  // Security check: only scrape the designated mock store
  const urlObj = new URL(targetUrl);

  if (
    urlObj.hostname !== 'demo.inelabteamdev.com' &&
    urlObj.hostname !== 'localhost'
  ) {
    throw new Error(
      `Refusing to scrape unauthorized domain: ${urlObj.hostname}`
    );
  }

  const browser = await getBrowser(isHeaded);

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();

  // General Playwright timeout
  page.setDefaultTimeout(config.scrapeTimeoutMs);

  // Prevent navigation from hanging indefinitely
  page.setDefaultNavigationTimeout(20000);

  let capturedToken = null;
  let decryptedQuote = null;
  let lastHttpStatus = 200;

  // Intercept network responses to capture server token & decrypted price payload
  page.on('response', async res => {
    const url = res.url();

    if (url.includes('/api/session') && res.status() === 200) {
      try {
        const data = await res.json();

        if (data && data.token) {
          capturedToken = data.token;
        }
      } catch (e) { }
    }

    if (url.includes(`/api/products/${productId}/price`)) {
      lastHttpStatus = res.status();

      if (res.status() === 200) {
        try {
          const data = await res.json();

          if (data && data.e && capturedToken) {
            decryptedQuote = decryptPayload(data.e, capturedToken);
          }
        } catch (e) { }
      }
    }
  });

  try {
    // 1. Navigate to product page
    await page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 20000
    });

    // Helper: Proactively dismiss or clear the delayed cookie banner overlay
    async function handleCookieOverlay() {
      try {
        const overlay = page.locator('.cookie-overlay');

        if (await overlay.isVisible({ timeout: 150 })) {
          const acceptBtn = page.locator(
            '.cookie-banner button:has-text("Accept")'
          );

          let tries = 0;

          while (await overlay.isVisible() && tries < 4) {
            tries++;

            if (await acceptBtn.isVisible()) {
              await acceptBtn
                .click({ force: true })
                .catch(() => { });

              await page.waitForTimeout(150);
            }
          }

          if (await overlay.isVisible()) {
            await page
              .evaluate(() => {
                document.querySelector('.cookie-overlay')?.remove();
                document.body.style.overflow = 'auto';
              })
              .catch(() => { });
          }
        }
      } catch (e) { }
    }

    // 2. Wait for product details to render
    await page.waitForSelector('.detail-info h1', {
      timeout: 10000
    });

    const productName = (
      await page.locator('.detail-info h1').innerText()
    ).trim();

    const brandSkuText = (
      await page
        .locator('.detail-brand')
        .innerText()
        .catch(() => '')
    ).trim();

    const category = (
      await page
        .locator('.tile-category')
        .first()
        .innerText()
        .catch(() => '')
    ).trim();

    await handleCookieOverlay();

    // 3. Locate price block & perform human-like mouse movements
    // to satisfy anti-bot requirements
    const priceBlock = page.locator('.price-block');

    await priceBlock.scrollIntoViewIfNeeded();

    const box = await priceBlock.boundingBox();

    if (box) {
      for (let i = 0; i < 22; i++) {
        await handleCookieOverlay();

        await page.mouse.move(
          box.x + 35 + i * 4,
          box.y + 20 + (i % 3) * 4
        );

        await page.waitForTimeout(55);
      }
    }

    await page.waitForTimeout(750);

    await handleCookieOverlay();

    // 4. Click "Reveal price"
    const revealBtn = page.locator(
      'button:has-text("Reveal price")'
    );

    await revealBtn.waitFor({
      state: 'visible',
      timeout: 6000
    });

    let clickAccepted = false;

    for (let c = 1; c <= 6; c++) {
      await handleCookieOverlay();

      const disabled = await revealBtn.getAttribute('disabled');

      if (disabled !== null) {
        if (box) {
          await page.mouse.move(
            box.x + 45 + c * 3,
            box.y + 22
          );
        }

        await page.waitForTimeout(250);
        continue;
      }

      try {
        await revealBtn.click({
          timeout: 2000
        });
      } catch (err) {
        await handleCookieOverlay();
        continue;
      }

      // Check if price area transitioned to spinner,
      // error, or success
      try {
        await page.waitForSelector(
          '.spinner, .price-success, .price-error',
          {
            timeout: 1800
          }
        );

        clickAccepted = true;
        break;
      } catch (e) {
        // Click was dropped by synthetic jitter, retry
        await page.waitForTimeout(400);
      }
    }

    if (!clickAccepted) {
      throw new Error(
        'Failed to activate "Reveal price" button after multiple interaction attempts'
      );
    }

    // 5. Wait for price resolution or transient challenge errors
    const resolution = await Promise.race([
      page
        .waitForSelector('.price-success', {
          timeout: 18000
        })
        .then(() => 'success'),

      page
        .waitForSelector('.price-error', {
          timeout: 18000
        })
        .then(() => 'error')
    ]);

    if (resolution === 'error') {
      // Storefront encountered transient challenge_failed
      const tryAgainBtn = page.locator(
        '.price-error button:has-text("Try again")'
      );

      if (await tryAgainBtn.isVisible()) {
        await page.waitForTimeout(500);

        await tryAgainBtn
          .click()
          .catch(() => { });

        // Wait again for success
        await page.waitForSelector('.price-success', {
          timeout: 15000
        });
      } else {
        const errorText = await page
          .locator('.price-error')
          .innerText()
          .catch(() => 'unknown error');

        throw new Error(
          `Storefront challenge failed: ${errorText}`
        );
      }
    }

    // 6. DOM Extraction of Stock
    const stockBadge = page.locator('.stock-badge');

    const rawStockText = (
      await stockBadge.innerText().catch(() => '')
    ).trim();

    const isOutOfStock = rawStockText
      .toLowerCase()
      .includes('out of stock');

    const stockNumMatch = rawStockText.match(/(\d+)/);

    const stockCount = isOutOfStock
      ? 0
      : stockNumMatch
        ? parseInt(stockNumMatch[1], 10)
        : 1;

    // 7. DOM Extraction of Price
    // Strict filtering: Ignore decoy elements
    const domPriceInfo = await page.evaluate(() => {
      const priceMain = document.querySelector('.price-main');

      if (!priceMain) return null;

      for (const child of priceMain.children) {
        const style = window.getComputedStyle(child);

        if (
          style.display === 'none' ||
          style.visibility === 'hidden'
        ) {
          continue;
        }

        if (
          child.classList.contains('price-value') ||
          child.dataset.price === 'true'
        ) {
          continue;
        }

        const fSize = parseFloat(style.fontSize);

        if (fSize >= 28) {
          const rawText = child.innerText
            .replace(/\u200B/g, '')
            .trim();

          return rawText;
        }
      }

      return null;
    });

    // 8. Determine final validated numeric price
    let finalPrice = null;

    if (
      decryptedQuote &&
      typeof decryptedQuote.p === 'number' &&
      decryptedQuote.p > 0
    ) {
      finalPrice = decryptedQuote.p;
    } else if (domPriceInfo) {
      const digitsOnly = domPriceInfo.replace(/[^\d.]/g, '');
      finalPrice = parseFloat(digitsOnly);
    }

    const scrapedData = {
      productId: parseInt(productId, 10),
      name: productName,
      category,
      brandSku: brandSkuText,
      url: targetUrl,
      price: finalPrice,
      formattedPrice:
        domPriceInfo ||
        (finalPrice ? `₹${finalPrice}` : null),
      stock: stockCount,
      stockStatus:
        rawStockText ||
        (stockCount > 0 ? 'In Stock' : 'Out of Stock'),
      currency: decryptedQuote
        ? decryptedQuote.c
        : 'INR',
      mrp: decryptedQuote
        ? decryptedQuote.m
        : null,
      seller: decryptedQuote
        ? decryptedQuote.sl
        : null,
      interceptedQuote: decryptedQuote,
      httpStatus: lastHttpStatus,
      scrapedAt: new Date().toISOString()
    };

    // 9. Validation Gatekeeper
    const validation = validateScrapedData(scrapedData);

    if (!validation.isValid) {
      throw new Error(
        `Data validation failed: ${validation.errors.join(', ')}`
      );
    }

    return scrapedData;
  } finally {
    await context.close().catch(() => { });
    await closeBrowser(browser, isHeaded);
  }
}

/**
 * High-level scraping function with exponential backoff retry mechanism
 *
 * @param {number|string} productId
 * @param {object} options - { headed, maxRetries, initialBackoffMs }
 */
async function scrapeProductWithRetries(
  productId,
  options = {}
) {
  const numericId = parseInt(productId, 10);
  const isHeaded = Boolean(options.headed);
  const maxRetries =
    options.maxRetries !== undefined
      ? options.maxRetries
      : 3;

  const initialBackoffMs =
    options.initialBackoffMs || 1000;

  const startTime = Date.now();
  let attempt = 0;
  let lastError = null;

  while (attempt < maxRetries) {
    attempt++;

    console.log(
      `[Scraper] Scraping product ${numericId} ` +
      `(attempt ${attempt}/${maxRetries}, headed: ${isHeaded})...`
    );

    try {
      // Hard timeout for one complete scrape attempt.
      // Prevents Render from getting stuck indefinitely.
      const data = await withTimeout(
        scrapeAttempt(numericId, isHeaded),
        60000,
        `Scrape attempt timed out after 60 seconds for product ${numericId}`
      );

      const durationMs = Date.now() - startTime;

      console.log(
        `[Scraper] Success for product ${numericId} ` +
        `in ${durationMs}ms on attempt ${attempt}`
      );

      return {
        success: true,
        data,
        attempts: attempt,
        durationMs,
        status: attempt === 1 ? 'success' : 'retried',
        error: null
      };
    } catch (err) {
      lastError = err;

      console.warn(
        `[Scraper] Attempt ${attempt} failed for product ${numericId}: ${err.message}`
      );

      if (attempt < maxRetries) {
        // Exponential backoff with random jitter
        const jitter = Math.floor(
          Math.random() * 500
        );

        const backoffMs =
          Math.pow(2, attempt - 1) *
          initialBackoffMs +
          jitter;

        console.log(
          `[Scraper] Backing off for ${backoffMs}ms before retry...`
        );

        await sleep(backoffMs);
      }
    }
  }

  const durationMs = Date.now() - startTime;

  console.error(
    `[Scraper] All ${maxRetries} attempts failed for product ${numericId}: ${lastError.message}`
  );

  return {
    success: false,
    data: null,
    attempts: attempt,
    durationMs,
    status: 'failed',
    error: lastError
  };
}

module.exports = {
  scrapeAttempt,
  scrapeProductWithRetries
};