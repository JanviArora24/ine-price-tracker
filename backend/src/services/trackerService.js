const db = require('../database/db');
const { searchProducts, getProductDetails } = require('./searchService');
const { scrapeProductWithRetries } = require('../scraper/scraperEngine');
const config = require('../config/env');

async function listTrackedProducts() {
  return await db.getTrackedProducts();
}

async function getTrackedProductById(id) {
  const product = await db.getTrackedProductById(id);
  if (!product) {
    throw new Error(`Tracked product with ID ${id} not found`);
  }
  return product;
}

async function trackProduct(externalProductId) {
  const numericId = parseInt(externalProductId, 10);
  if (isNaN(numericId) || numericId <= 0) {
    throw new Error('Valid numeric external product ID is required');
  }

  // 1. Check for duplicates
  const existing = await db.getTrackedProductByExternalId(numericId);
  if (existing) {
    const error = new Error(`Product ${numericId} is already being tracked`);
    error.statusCode = 409;
    error.existingProduct = existing;
    throw error;
  }

  // 2. Fetch product metadata from mock store
  const metadata = await getProductDetails(numericId);
  if (!metadata) {
    throw new Error(`Product ${numericId} not found in INE mock store`);
  }

  const productRecord = {
    external_product_id: numericId,
    name: metadata.name,
    slug: metadata.slug || '',
    brand: metadata.brand || '',
    category: metadata.category || '',
    sku: metadata.sku || '',
    url: `${config.mockStoreBaseUrl}/product/${numericId}`,
    image_url: '',
    current_price: null,
    current_stock: null,
    stock_status: 'Pending initial scrape',
    last_scraped_at: null,
    last_scrape_status: 'pending'
  };

  // 3. Persist product in database
  const createdProduct = await db.addTrackedProduct(productRecord);

  // 4. Perform an initial scrape asynchronously or immediately
  // We perform it and update the product so the user gets initial price right away
  try {
    const scrapeResult = await scrapeProductWithRetries(numericId, {
      headed: false,
      maxRetries: 3
    });

    if (scrapeResult.success && scrapeResult.data) {
      const d = scrapeResult.data;
      // Update product current data
      const updated = await db.updateTrackedProductPrice(createdProduct.id, {
        current_price: d.price,
        current_stock: d.stock,
        stock_status: d.stockStatus,
        last_scraped_at: d.scrapedAt,
        last_scrape_status: scrapeResult.status
      });

      // Insert into price_history
      await db.insertPriceHistory({
        trackedProductId: createdProduct.id,
        price: d.price,
        stock: d.stock,
        stockStatus: d.stockStatus,
        scrapedAt: d.scrapedAt
      });

      // Insert into scrape_logs
      await db.insertScrapeLog({
        trackedProductId: createdProduct.id,
        status: scrapeResult.status,
        attempts: scrapeResult.attempts,
        durationMs: scrapeResult.durationMs,
        httpStatus: 200,
        errorMessage: null,
        details: {
          formattedPrice: d.formattedPrice,
          seller: d.seller
        }
      });

      return updated;
    } else {
      // Scrape failed, update status to failed but keep product
      await db.updateTrackedProductPrice(createdProduct.id, {
        last_scraped_at: new Date().toISOString(),
        last_scrape_status: 'failed'
      });

      await db.insertScrapeLog({
        trackedProductId: createdProduct.id,
        status: 'failed',
        attempts: scrapeResult.attempts,
        durationMs: scrapeResult.durationMs,
        httpStatus: null,
        errorMessage: scrapeResult.error ? scrapeResult.error.message : 'Initial scrape failed'
      });

      return createdProduct;
    }
  } catch (err) {
    console.error(`[TrackerService] Initial scrape failed for product ${numericId}:`, err.message);
    await db.insertScrapeLog({
      trackedProductId: createdProduct.id,
      status: 'failed',
      attempts: 1,
      durationMs: 0,
      httpStatus: null,
      errorMessage: err.message
    });
    return createdProduct;
  }
}

async function scrapeSingleProduct(id) {
  const product = await db.getTrackedProductById(id);
  if (!product) {
    throw new Error(`Tracked product ${id} not found`);
  }

  const numericId = parseInt(product.external_product_id, 10);
  if (isNaN(numericId) || numericId <= 0) {
    throw new Error(`Cannot scrape product ${id}: missing or invalid external product ID`);
  }

  const scrapeResult = await scrapeProductWithRetries(numericId, {
    headed: false,
    maxRetries: 3
  });

  if (scrapeResult.success && scrapeResult.data) {
    const d = scrapeResult.data;

    // 1. Update latest valid price/stock on product
    const updatedProduct = await db.updateTrackedProductPrice(product.id, {
      current_price: d.price,
      current_stock: d.stock,
      stock_status: d.stockStatus,
      last_scraped_at: d.scrapedAt,
      last_scrape_status: scrapeResult.status
    });

    // 2. Insert record into price_history (ONLY ON SUCCESS!)
    const historyEntry = await db.insertPriceHistory({
      trackedProductId: product.id,
      price: d.price,
      stock: d.stock,
      stockStatus: d.stockStatus,
      scrapedAt: d.scrapedAt
    });

    // 3. Insert record into scrape_logs
    const logEntry = await db.insertScrapeLog({
      trackedProductId: product.id,
      status: scrapeResult.status,
      attempts: scrapeResult.attempts,
      durationMs: scrapeResult.durationMs,
      httpStatus: 200,
      errorMessage: null,
      details: {
        formattedPrice: d.formattedPrice,
        seller: d.seller,
        intercepted: Boolean(d.interceptedQuote)
      }
    });

    return {
      success: true,
      product: updatedProduct,
      historyEntry,
      logEntry
    };
  } else {
    // FAILED SCRAPE:
    // IMPORTANT RULE: Never overwrite valid data with bad/empty data.
    // Preserve existing current_price and current_stock.
    const updatedProduct = await db.updateTrackedProductPrice(product.id, {
      last_scraped_at: new Date().toISOString(),
      last_scrape_status: 'failed'
    });

    // Record failure in scrape_logs (NOT in price_history!)
    const logEntry = await db.insertScrapeLog({
      trackedProductId: product.id,
      status: 'failed',
      attempts: scrapeResult.attempts,
      durationMs: scrapeResult.durationMs,
      httpStatus: null,
      errorMessage: scrapeResult.error ? scrapeResult.error.message : 'Scrape failed after all retries',
      details: {
        preservedPrice: product.current_price,
        preservedStock: product.current_stock
      }
    });

    return {
      success: false,
      product: updatedProduct,
      historyEntry: null,
      logEntry,
      error: scrapeResult.error ? scrapeResult.error.message : 'Scrape failed'
    };
  }
}

async function untrackProduct(id) {
  const product = await db.getTrackedProductById(id);
  if (!product) {
    throw new Error(`Tracked product with ID ${id} not found`);
  }
  return await db.deleteTrackedProduct(id);
}

async function getProductHistory(id, limit = 50) {
  return await db.getPriceHistory(id, limit);
}

async function getProductLogs(id, limit = 50) {
  return await db.getScrapeLogs(id, limit);
}

module.exports = {
  listTrackedProducts,
  getTrackedProductById,
  trackProduct,
  scrapeSingleProduct,
  untrackProduct,
  getProductHistory,
  getProductLogs
};
