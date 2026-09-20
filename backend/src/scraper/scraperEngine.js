const { getBrowser, closeBrowser } = require('./browserPool');
const { decryptPayload } = require('./decryptor');
const { validateScrapedData } = require('./validator');
const config = require('../config/env');

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

function withTimeout(promise, ms, message = 'Scrape attempt timed out') {
  let timer;

  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(message));
    }, ms);
  });

  return Promise.race([promise, timeoutPromise])
    .finally(() => clearTimeout(timer));
}

/**
 * Execute one scrape attempt.
 */
async function scrapeAttempt(productId, isHeaded = false) {
  const baseUrl = config.mockStoreBaseUrl;
  const targetUrl = `${baseUrl}/product/${productId}`;

  // Security check
  const urlObj = new URL(targetUrl);

  if (
    urlObj.hostname !== 'demo.inelabteamdev.com' &&
    urlObj.hostname !== 'localhost'
  ) {
    throw new Error(
      `Refusing to scrape unauthorized domain: ${urlObj.hostname}`
    );
  }

  let browser = null;
  let context = null;

  try {
    console.log(`[Scraper] Launching browser for product ${productId}...`);

    // Protect browser launch itself
    browser = await withTimeout(
      getBrowser(isHeaded),
      15000,
      `Browser launch timed out for product ${productId}`
    );

    console.log(`[Scraper] Browser ready for product ${productId}`);

    context = await withTimeout(
      browser.newContext({
        viewport: {
          width: 1280,
          height: 800
        },
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
      }),
      10000,
      `Browser context creation timed out for product ${productId}`
    );

    const page = await withTimeout(
      context.newPage(),
      10000,
      `Page creation timed out for product ${productId}`
    );

    page.setDefaultTimeout(
      Math.min(config.scrapeTimeoutMs || 10000, 10000)
    );

    page.setDefaultNavigationTimeout(15000);

    let capturedToken = null;
    let decryptedQuote = null;
    let lastHttpStatus = 200;

    // Capture API responses
    page.on('response', async (res) => {
      try {
        const url = res.url();

        // Session token
        if (
          url.includes('/api/session') &&
          res.status() === 200
        ) {
          const data = await res.json().catch(() => null);

          if (data && data.token) {
            capturedToken = data.token;
            console.log(
              `[Scraper] Captured session token for product ${productId}`
            );
          }
        }

        // Price API
        if (
          url.includes(`/api/products/${productId}/price`)
        ) {
          lastHttpStatus = res.status();

          if (res.status() === 200) {
            const data = await res.json().catch(() => null);

            if (data && data.e && capturedToken) {
              try {
                decryptedQuote = decryptPayload(
                  data.e,
                  capturedToken
                );
              } catch (err) {
                console.warn(
                  `[Scraper] Could not decrypt price payload: ${err.message}`
                );
              }
            }
          }
        }
      } catch (err) {
        // Never allow response listener errors to break scraping
      }
    });

    // -------------------------------------------------------
    // 1. Navigate
    // -------------------------------------------------------

    console.log(
      `[Scraper] Navigating to ${targetUrl}...`
    );

    await page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 15000
    });

    console.log(
      `[Scraper] Product page loaded for ${productId}`
    );

    // -------------------------------------------------------
    // Cookie overlay handler
    // -------------------------------------------------------

    async function handleCookieOverlay() {
      try {
        const overlay = page.locator('.cookie-overlay');

        const visible = await overlay
          .isVisible({ timeout: 500 })
          .catch(() => false);

        if (!visible) return;

        const acceptBtn = page.locator(
          '.cookie-banner button:has-text("Accept")'
        );

        for (let i = 0; i < 3; i++) {
          const btnVisible = await acceptBtn
            .isVisible()
            .catch(() => false);

          if (btnVisible) {
            await acceptBtn
              .click({
                force: true,
                timeout: 1000
              })
              .catch(() => { });
          }

          await page.waitForTimeout(100);
        }

        const stillVisible = await overlay
          .isVisible()
          .catch(() => false);

        if (stillVisible) {
          await page
            .evaluate(() => {
              document
                .querySelector('.cookie-overlay')
                ?.remove();

              if (document.body) {
                document.body.style.overflow = 'auto';
              }
            })
            .catch(() => { });
        }
      } catch (err) {
        // Ignore cookie overlay errors
      }
    }

    // -------------------------------------------------------
    // 2. Product information
    // -------------------------------------------------------

    await page.waitForSelector('.detail-info h1', {
      timeout: 10000
    });

    const productName = (
      await page
        .locator('.detail-info h1')
        .innerText()
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

    // -------------------------------------------------------
    // 3. Price block interaction
    // -------------------------------------------------------

    const priceBlock = page.locator('.price-block');

    await priceBlock.scrollIntoViewIfNeeded({
      timeout: 5000
    }).catch(() => { });

    const box = await priceBlock
      .boundingBox()
      .catch(() => null);

    // Small human-like movement
    if (box) {
      for (let i = 0; i < 8; i++) {
        await handleCookieOverlay();

        await page.mouse
          .move(
            box.x + 30 + i * 5,
            box.y + 20
          )
          .catch(() => { });

        await page.waitForTimeout(50);
      }
    }

    await page.waitForTimeout(300);

    await handleCookieOverlay();

    // -------------------------------------------------------
    // 4. Reveal price
    // -------------------------------------------------------

    const revealBtn = page.locator(
      'button:has-text("Reveal price")'
    );

    await revealBtn.waitFor({
      state: 'visible',
      timeout: 7000
    });

    let clickAccepted = false;

    for (let attempt = 1; attempt <= 5; attempt++) {
      await handleCookieOverlay();

      const disabled = await revealBtn
        .getAttribute('disabled')
        .catch(() => null);

      if (disabled !== null) {
        await page.waitForTimeout(300);
        continue;
      }

      try {
        await revealBtn.click({
          timeout: 2000
        });

        clickAccepted = true;
        break;
      } catch (err) {
        await page.waitForTimeout(300);
      }
    }

    if (!clickAccepted) {
      throw new Error(
        'Failed to activate "Reveal price" button'
      );
    }

    console.log(
      `[Scraper] Reveal price clicked for product ${productId}`
    );

    // -------------------------------------------------------
    // 5. Wait for price result
    // -------------------------------------------------------

    let resolution = null;

    try {
      resolution = await Promise.race([
        page
          .waitForSelector('.price-success', {
            timeout: 12000
          })
          .then(() => 'success'),

        page
          .waitForSelector('.price-error', {
            timeout: 12000
          })
          .then(() => 'error')
      ]);
    } catch (err) {
      throw new Error(
        `Price resolution timed out for product ${productId}`
      );
    }

    if (resolution === 'error') {
      const tryAgainBtn = page.locator(
        '.price-error button:has-text("Try again")'
      );

      const canRetry = await tryAgainBtn
        .isVisible()
        .catch(() => false);

      if (canRetry) {
        await tryAgainBtn
          .click({
            timeout: 2000
          })
          .catch(() => { });

        await page.waitForSelector(
          '.price-success',
          {
            timeout: 10000
          }
        );
      } else {
        const errorText = await page
          .locator('.price-error')
          .innerText()
          .catch(() => 'Unknown storefront error');

        throw new Error(
          `Storefront challenge failed: ${errorText}`
        );
      }
    }

    console.log(
      `[Scraper] Price successfully resolved for product ${productId}`
    );

    // -------------------------------------------------------
    // 6. Stock
    // -------------------------------------------------------

    const stockBadge = page.locator('.stock-badge');

    const rawStockText = (
      await stockBadge
        .innerText()
        .catch(() => '')
    ).trim();

    const isOutOfStock = rawStockText
      .toLowerCase()
      .includes('out of stock');

    const stockNumMatch =
      rawStockText.match(/(\d+)/);

    const stockCount = isOutOfStock
      ? 0
      : stockNumMatch
        ? parseInt(stockNumMatch[1], 10)
        : 1;

    // -------------------------------------------------------
    // 7. Price from DOM
    // -------------------------------------------------------

    const domPriceInfo = await page.evaluate(() => {
      const priceMain =
        document.querySelector('.price-main');

      if (!priceMain) return null;

      for (const child of priceMain.children) {
        const style =
          window.getComputedStyle(child);

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

        const fontSize =
          parseFloat(style.fontSize);

        if (fontSize >= 28) {
          return child.innerText
            .replace(/\u200B/g, '')
            .trim();
        }
      }

      return null;
    });

    // -------------------------------------------------------
    // 8. Final price
    // -------------------------------------------------------

    let finalPrice = null;

    if (
      decryptedQuote &&
      typeof decryptedQuote.p === 'number' &&
      decryptedQuote.p > 0
    ) {
      finalPrice = decryptedQuote.p;
    } else if (domPriceInfo) {
      const digitsOnly =
        domPriceInfo.replace(/[^\d.]/g, '');

      finalPrice = parseFloat(digitsOnly);
    }

    if (
      !Number.isFinite(finalPrice) ||
      finalPrice <= 0
    ) {
      throw new Error(
        `Could not extract valid price for product ${productId}`
      );
    }

    // -------------------------------------------------------
    // 9. Build scraped data
    // -------------------------------------------------------

    const scrapedData = {
      productId: parseInt(productId, 10),
      name: productName,
      category,
      brandSku: brandSkuText,
      url: targetUrl,

      price: finalPrice,

      formattedPrice:
        domPriceInfo ||
        `₹${finalPrice}`,

      stock: stockCount,

      stockStatus:
        rawStockText ||
        (stockCount > 0
          ? 'In Stock'
          : 'Out of Stock'),

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

      scrapedAt:
        new Date().toISOString()
    };

    // -------------------------------------------------------
    // 10. Validation
    // -------------------------------------------------------

    const validation =
      validateScrapedData(scrapedData);

    if (!validation.isValid) {
      throw new Error(
        `Data validation failed: ${validation.errors.join(', ')}`
      );
    }

    console.log(
      `[Scraper] Valid data extracted for product ${productId}: ₹${finalPrice}, stock ${stockCount}`
    );

    return scrapedData;
  } finally {
    // Always close context
    if (context) {
      await context
        .close()
        .catch(() => { });
    }

    // Close only headed/dedicated browser.
    // Shared headless browser stays alive.
    if (browser) {
      await closeBrowser(
        browser,
        isHeaded
      );
    }
  }
}

/**
 * Scrape with retries.
 */
async function scrapeProductWithRetries(
  productId,
  options = {}
) {
  const numericId =
    parseInt(productId, 10);

  if (
    !Number.isInteger(numericId) ||
    numericId <= 0
  ) {
    return {
      success: false,
      data: null,
      attempts: 0,
      durationMs: 0,
      status: 'failed',
      error: new Error(
        `Invalid product ID: ${productId}`
      )
    };
  }

  const isHeaded =
    Boolean(options.headed);

  const maxRetries =
    options.maxRetries !== undefined
      ? Math.max(1, options.maxRetries)
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
      /*
       * IMPORTANT:
       * Keep each complete attempt below 45 sec.
       * This prevents Render request/background jobs
       * from hanging indefinitely.
       */
      const data = await withTimeout(
        scrapeAttempt(
          numericId,
          isHeaded
        ),
        45000,
        `Scrape attempt timed out after 45 seconds for product ${numericId}`
      );

      const durationMs =
        Date.now() - startTime;

      console.log(
        `[Scraper] Success for product ${numericId} ` +
        `in ${durationMs}ms on attempt ${attempt}`
      );

      return {
        success: true,
        data,
        attempts: attempt,
        durationMs,
        status:
          attempt === 1
            ? 'success'
            : 'retried',
        error: null
      };
    } catch (err) {
      lastError = err;

      console.warn(
        `[Scraper] Attempt ${attempt} failed for product ${numericId}: ${err.message}`
      );

      if (attempt < maxRetries) {
        const jitter =
          Math.floor(
            Math.random() * 300
          );

        const backoffMs =
          Math.pow(
            2,
            attempt - 1
          ) *
          initialBackoffMs +
          jitter;

        console.log(
          `[Scraper] Waiting ${backoffMs}ms before retry for product ${numericId}...`
        );

        await sleep(backoffMs);
      }
    }
  }

  const durationMs =
    Date.now() - startTime;

  console.error(
    `[Scraper] All ${maxRetries} attempts failed for product ${numericId}: ${lastError?.message}`
  );

  return {
    success: false,
    data: null,
    attempts: attempt,
    durationMs,
    status: 'failed',
    error:
      lastError ||
      new Error('Unknown scraping error')
  };
}

module.exports = {
  scrapeAttempt,
  scrapeProductWithRetries
};