const db = require('../database/db');
const { scrapeSingleProduct } = require('./trackerService');

/**
 * Runs a batch scrape across all tracked products for scheduled jobs (e.g. cron-job.org)
 * Continues processing subsequent products even if an individual product fails.
 */
async function runScheduledScrape() {
  const startTime = Date.now();
  const trackedProducts = await db.getTrackedProducts();

  console.log(`[CronService] Starting scheduled batch scrape for ${trackedProducts.length} tracked products...`);

  const summary = {
    totalTracked: trackedProducts.length,
    processed: 0,
    succeeded: 0,
    retried: 0,
    failed: 0,
    startedAt: new Date(startTime).toISOString(),
    completedAt: null,
    durationMs: 0,
    results: []
  };

  if (trackedProducts.length === 0) {
    summary.completedAt = new Date().toISOString();
    summary.durationMs = Date.now() - startTime;
    return summary;
  }

  // Iterate through products sequentially to prevent memory exhaustion on serverless/free tiers
  for (const product of trackedProducts) {
    summary.processed++;
    console.log(`[CronService] [${summary.processed}/${trackedProducts.length}] Processing product: "${product.name}" (ID: ${product.external_product_id})`);

    try {
      const outcome = await scrapeSingleProduct(product.id);

      if (outcome.success) {
        if (outcome.logEntry && outcome.logEntry.status === 'retried') {
          summary.retried++;
        } else {
          summary.succeeded++;
        }
        summary.results.push({
          productId: product.id,
          externalId: product.external_product_id,
          name: product.name,
          status: outcome.logEntry ? outcome.logEntry.status : 'success',
          price: outcome.product.current_price,
          stock: outcome.product.current_stock,
          attempts: outcome.logEntry ? outcome.logEntry.attempts : 1,
          durationMs: outcome.logEntry ? outcome.logEntry.duration_ms : 0
        });
      } else {
        summary.failed++;
        summary.results.push({
          productId: product.id,
          externalId: product.external_product_id,
          name: product.name,
          status: 'failed',
          preservedPrice: product.current_price,
          preservedStock: product.current_stock,
          error: outcome.error || 'Scrape failed',
          attempts: outcome.logEntry ? outcome.logEntry.attempts : 3,
          durationMs: outcome.logEntry ? outcome.logEntry.duration_ms : 0
        });
      }
    } catch (err) {
      console.error(`[CronService] Unexpected exception processing product ${product.external_product_id}:`, err.message);
      summary.failed++;
      summary.results.push({
        productId: product.id,
        externalId: product.external_product_id,
        name: product.name,
        status: 'failed',
        error: err.message,
        durationMs: 0
      });
    }
  }

  summary.completedAt = new Date().toISOString();
  summary.durationMs = Date.now() - startTime;
  console.log(`[CronService] Completed batch scrape in ${summary.durationMs}ms: ${summary.succeeded} succeeded, ${summary.retried} retried, ${summary.failed} failed.`);

  return summary;
}

module.exports = {
  runScheduledScrape
};
