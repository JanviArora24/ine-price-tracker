const assert = require('assert');
const app = require('../src/app');
const config = require('../src/config/env');
const db = require('../src/database/db');

let server;
const PORT = 5555;
const BASE_URL = `http://localhost:${PORT}`;

async function runE2E() {
  console.log('\n=============================================================');
  console.log('            STARTING END-TO-END INTEGRATION TESTS            ');
  console.log('=============================================================\n');

  // Start server on dedicated test port
  await new Promise((resolve) => {
    server = app.listen(PORT, () => {
      console.log(`[E2E] Test server listening on ${BASE_URL}`);
      resolve();
    });
  });

  let passed = 0;
  let failed = 0;

  async function step(title, fn) {
    try {
      console.log(`Testing: ${title}...`);
      await fn();
      console.log(`  ✓ PASSED: ${title}\n`);
      passed++;
    } catch (err) {
      console.error(`  ✗ FAILED: ${title}`);
      console.error(`    ${err.message}\n`);
      failed++;
    }
  }

  try {
    // 1. Health Check
    await step('GET /api/health returns 200 with status ok', async () => {
      const res = await fetch(`${BASE_URL}/api/health`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.status, 'ok');
      assert.ok(data.database);
    });

    // 2. Product Search
    await step('GET /api/products/search finds catalog items', async () => {
      const res = await fetch(`${BASE_URL}/api/products/search?q=headphones`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.ok(data.total > 0);
      assert.ok(data.items.length > 0);
    });

    // 3. Track Product
    let trackedId = null;
    await step('POST /api/tracker creates a new tracked product', async () => {
      // Clean up product 1 if already tracked
      const existing = await db.getTrackedProductByExternalId(1);
      if (existing) await db.deleteTrackedProduct(existing.id);

      const res = await fetch(`${BASE_URL}/api/tracker`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ externalProductId: 1 })
      });
      assert.strictEqual(res.status, 201);
      const data = await res.json();
      assert.ok(data.id);
      assert.strictEqual(data.external_product_id, 1);
      assert.strictEqual(data.name, 'Nordkraft Headphones Pro');
      trackedId = data.id;
    });

    // 4. Duplicate Tracking Prevention
    await step('POST /api/tracker rejects duplicate product with 409 Conflict', async () => {
      const res = await fetch(`${BASE_URL}/api/tracker`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ externalProductId: 1 })
      });
      assert.strictEqual(res.status, 409);
      const data = await res.json();
      assert.strictEqual(data.error, 'Error');
    });

    // 5. List Tracked Products
    await step('GET /api/tracker lists tracked products', async () => {
      const res = await fetch(`${BASE_URL}/api/tracker`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.ok(data.total >= 1);
      const found = data.products.find(p => p.id === trackedId);
      assert.ok(found);
    });

    // 6. Price History Retrieval
    await step('GET /api/tracker/:id/history returns price history', async () => {
      const res = await fetch(`${BASE_URL}/api/tracker/${trackedId}/history`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.ok(Array.isArray(data.history));
    });

    // 7. Scrape Logs Retrieval
    await step('GET /api/tracker/:id/logs returns scrape logs', async () => {
      const res = await fetch(`${BASE_URL}/api/tracker/${trackedId}/logs`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.ok(Array.isArray(data.logs));
    });

    // 8. Cron Endpoint Authentication
    await step('POST /api/cron/scrape rejects unauthenticated requests with 401', async () => {
      const res = await fetch(`${BASE_URL}/api/cron/scrape`, { method: 'POST' });
      assert.strictEqual(res.status, 401);
    });

    await step('POST /api/cron/scrape rejects invalid token with 403', async () => {
      const res = await fetch(`${BASE_URL}/api/cron/scrape`, {
        method: 'POST',
        headers: { 'X-Cron-Secret': 'invalid-token' }
      });
      assert.strictEqual(res.status, 403);
    });

    await step('POST /api/cron/scrape succeeds with valid secret token', async () => {
      const res = await fetch(`${BASE_URL}/api/cron/scrape`, {
        method: 'POST',
        headers: { 'X-Cron-Secret': config.cronSecret }
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(data.summary);
      assert.ok(data.summary.totalTracked >= 1);
      assert.ok(data.summary.processed >= 1);
    });

    // 9. Untrack Product
    await step('DELETE /api/tracker/:id untracks product', async () => {
      const res = await fetch(`${BASE_URL}/api/tracker/${trackedId}`, { method: 'DELETE' });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);

      // Verify product is gone
      const check = await db.getTrackedProductById(trackedId);
      assert.strictEqual(check, null);
    });

  } finally {
    if (server) {
      await new Promise(r => server.close(r));
      console.log('[E2E] Server closed.');
    }
  }

  console.log('=============================================================');
  console.log(`E2E RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('=============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runE2E().catch(err => {
  console.error('Fatal E2E error:', err);
  process.exit(1);
});
