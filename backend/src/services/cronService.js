const db = require('../database/db');
const { scrapeSingleProduct } = require('./trackerService');

/**
 * Runs a batch scrape across all tracked products for scheduled jobs.
 * Products are processed concurrently to keep the cron request
 * within cron-job.org's 30-second timeout.
 */
async function runScheduledScrape() {
  const startTime = Date.now();
  const trackedProducts = await db.getTrackedProducts();

  console.log(
    `[CronService] Starting scheduled batch scrape for ${trackedProducts.length} tracked products...`
  );

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

  // Run product scrapes concurrently so the complete batch
  // can finish within cron-job.org's 30-second timeout.
  const results = await Promise.all(
    trackedProducts.map(async (product) => {
      console.log(
        `[CronService] Processing product: "${product.name}" (ID: ${product.external_product_id})`
      );

      try {
        const outcome = await scrapeSingleProduct(product.id);

        if (outcome.success) {
          return {
            success: true,
            retried:
              outcome.logEntry &&
              outcome.logEntry.status === 'retried',

            result: {
              productId: product.id,
              externalId: product.external_product_id,
              name: product.name,
              status: outcome.logEntry
                ? outcome.logEntry.status
                : 'success',
              price: outcome.product.current_price,
              stock: outcome.product.current_stock,
              attempts: outcome.logEntry
                ? outcome.logEntry.attempts
                : 1,
              durationMs: outcome.logEntry
                ? outcome.logEntry.duration_ms
                : 0
            }
          };
        }

        return {
          success: false,
          retried: false,
          result: {
            productId: product.id,
            externalId: product.external_product_id,
            name: product.name,
            status: 'failed',
            preservedPrice: product.current_price,
            preservedStock: product.current_stock,
            error: outcome.error || 'Scrape failed',
            attempts: outcome.logEntry
              ? outcome.logEntry.attempts
              : 3,
            durationMs: outcome.logEntry
              ? outcome.logEntry.duration_ms
              : 0
          }
        };
      } catch (err) {
        console.error(
          `[CronService] Unexpected exception processing product ${product.external_product_id}:`,
          err.message
        );

        return {
          success: false,
          retried: false,
          result: {
            productId: product.id,
            externalId: product.external_product_id,
            name: product.name,
            status: 'failed',
            error: err.message,
            durationMs: 0
          }
        };
      }
    })
  );

  // Build final summary
  summary.processed = results.length;

  for (const item of results) {
    if (item.success) {
      if (item.retried) {
        summary.retried++;
      } else {
        summary.succeeded++;
      }
    } else {
      summary.failed++;
    }

    summary.results.push(item.result);
  }

  summary.completedAt = new Date().toISOString();
  summary.durationMs = Date.now() - startTime;

  console.log(
    `[CronService] Completed batch scrape in ${summary.durationMs}ms: ` +
    `${summary.succeeded} succeeded, ` +
    `${summary.retried} retried, ` +
    `${summary.failed} failed.`
  );

  return summary;
}

module.exports = {
  runScheduledScrape
};