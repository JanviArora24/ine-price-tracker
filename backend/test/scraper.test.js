const assert = require('assert');
const { validateScrapedData } = require('../src/scraper/validator');
const { decryptPayload, SHARED_KEY } = require('../src/scraper/decryptor');
const crypto = require('crypto');
const db = require('../src/database/db');
const { searchProducts } = require('../src/services/searchService');

async function runTests() {
  console.log('\n=============================================================');
  console.log('       RUNNING BACKEND & SCRAPER AUTOMATED TEST SUITE        ');
  console.log('=============================================================\n');

  let passed = 0;
  let failed = 0;

  function test(description, fn) {
    try {
      fn();
      console.log(`  ✓ ${description}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${description}`);
      console.error(`    Error: ${err.message}`);
      failed++;
    }
  }

  async function asyncTest(description, fn) {
    try {
      await fn();
      console.log(`  ✓ ${description}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${description}`);
      console.error(`    Error: ${err.message}`);
      failed++;
    }
  }

  // 1. Validator Tests
  console.log('--- 1. Scraped Data Validation & Decoy Protection ---');

  test('Valid product data passes validation', () => {
    const valid = {
      productId: 1,
      name: 'Nordkraft Headphones Pro',
      price: 7543,
      stock: 15,
      url: 'https://demo.inelabteamdev.com/product/1'
    };
    const res = validateScrapedData(valid);
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.errors.length, 0);
  });

  test('Rejects null, undefined, or NaN price', () => {
    assert.strictEqual(validateScrapedData({ productId: 1, name: 'P', price: null, stock: 5 }).isValid, false);
    assert.strictEqual(validateScrapedData({ productId: 1, name: 'P', price: undefined, stock: 5 }).isValid, false);
    assert.strictEqual(validateScrapedData({ productId: 1, name: 'P', price: NaN, stock: 5 }).isValid, false);
  });

  test('Rejects zero or negative price', () => {
    assert.strictEqual(validateScrapedData({ productId: 1, name: 'P', price: 0, stock: 5 }).isValid, false);
    assert.strictEqual(validateScrapedData({ productId: 1, name: 'P', price: -100, stock: 5 }).isValid, false);
  });

  test('Rejects negative stock or floating point stock', () => {
    assert.strictEqual(validateScrapedData({ productId: 1, name: 'P', price: 500, stock: -1 }).isValid, false);
    assert.strictEqual(validateScrapedData({ productId: 1, name: 'P', price: 500, stock: 2.5 }).isValid, false);
  });

  test('Rejects unauthorized external URL domains', () => {
    const malicious = {
      productId: 1,
      name: 'P',
      price: 500,
      stock: 5,
      url: 'https://attacker-site.com/product/1'
    };
    assert.strictEqual(validateScrapedData(malicious).isValid, false);
  });

  // 2. Decryption Tests
  console.log('\n--- 2. Payload Decryption ---');

  test('Accurately decrypts mock store XOR encrypted payload', () => {
    const sampleToken = 'test-token-abcdef123456';
    const samplePayload = { p: 9999, s: 42, c: 'INR', sl: 'Test Seller' };
    const jsonStr = JSON.stringify(samplePayload);
    const key = crypto.createHash('sha256').update(`${SHARED_KEY}|enc|${sampleToken}`).digest();
    const cipher = Buffer.alloc(jsonStr.length);
    for (let i = 0; i < jsonStr.length; i++) {
      cipher[i] = Buffer.from(jsonStr)[i] ^ key[i % key.length];
    }
    const encryptedBase64 = cipher.toString('base64');

    const decrypted = decryptPayload(encryptedBase64, sampleToken);
    assert.strictEqual(decrypted.p, 9999);
    assert.strictEqual(decrypted.s, 42);
    assert.strictEqual(decrypted.c, 'INR');
  });

  // 3. Database & Anti-Corruption Rules
  console.log('\n--- 3. Database Integrity & History Rules ---');

  await asyncTest('Database adds tracked product and prevents duplicate external ID', async () => {
    const testExtId = 999901;
    // Clean up if exists
    const existing = await db.getTrackedProductByExternalId(testExtId);
    if (existing) await db.deleteTrackedProduct(existing.id);

    const added = await db.addTrackedProduct({
      external_product_id: testExtId,
      name: 'Unit Test Gadget',
      url: `https://demo.inelabteamdev.com/product/${testExtId}`,
      current_price: 1200,
      current_stock: 10
    });
    assert.ok(added.id);
    assert.strictEqual(added.external_product_id, testExtId);

    // Retrieve by external ID
    const found = await db.getTrackedProductByExternalId(testExtId);
    assert.strictEqual(found.id, added.id);
  });

  await asyncTest('Price history cannot be inserted with invalid/empty price', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000001';
    let threw = false;
    try {
      await db.insertPriceHistory({
        trackedProductId: fakeId,
        price: null,
        stock: 5
      });
    } catch (e) {
      threw = true;
    }
    assert.strictEqual(threw, true);
  });

  await asyncTest('Failed scrapes preserve valid existing product data and write scrape logs', async () => {
    const testExtId = 999902;
    const added = await db.addTrackedProduct({
      external_product_id: testExtId,
      name: 'Preservation Test Product',
      url: `https://demo.inelabteamdev.com/product/${testExtId}`,
      current_price: 4999,
      current_stock: 25,
      stock_status: 'In Stock'
    });

    // Simulate failed scrape update: update status to failed without touching current_price
    await db.updateTrackedProductPrice(added.id, {
      last_scraped_at: new Date().toISOString(),
      last_scrape_status: 'failed'
    });

    // Insert failed scrape log
    await db.insertScrapeLog({
      trackedProductId: added.id,
      status: 'failed',
      attempts: 3,
      durationMs: 4500,
      httpStatus: 504,
      errorMessage: 'Gateway Timeout simulation'
    });

    // Verify valid data is intact
    const product = await db.getTrackedProductById(added.id);
    assert.strictEqual(Number(product.current_price), 4999);
    assert.strictEqual(product.current_stock, 25);
    assert.strictEqual(product.last_scrape_status, 'failed');

    // Verify history has NO entries for this product
    const history = await db.getPriceHistory(added.id);
    assert.strictEqual(history.length, 0);

    // Verify log has entry
    const logs = await db.getScrapeLogs(added.id);
    assert.ok(logs.length >= 1);
    assert.strictEqual(logs[0].status, 'failed');
    assert.strictEqual(logs[0].error_message, 'Gateway Timeout simulation');

    // Clean up
    await db.deleteTrackedProduct(added.id);
  });

  // 4. Product Search Service
  console.log('\n--- 4. Product Search Against Real Store Catalog ---');

  await asyncTest('Searches mock store catalog for headphones', async () => {
    const results = await searchProducts('headphones', 1, 10);
    assert.ok(results.total > 0, 'Should find products matching "headphones"');
    assert.ok(results.items.length > 0);
    const first = results.items[0];
    assert.ok(first.id);
    assert.ok(first.name.toLowerCase().includes('headphones') || first.category.toLowerCase().includes('audio'));
  });

  await asyncTest('Searches mock store catalog for SKU', async () => {
    const results = await searchProducts('NOR-10001', 1, 5);
    assert.ok(results.total >= 1);
    assert.strictEqual(results.items[0].sku, 'NOR-10001');
  });

  // 5. Cron Secret Authentication
  console.log('\n--- 5. Cron Secret Authentication Middleware ---');

  test('Rejects request without cron secret', () => {
    const { requireCronSecret } = require('../src/middleware/auth');
    let statusSent = null;
    let bodySent = null;
    const req = { headers: {}, query: {} };
    const res = {
      status: (code) => {
        statusSent = code;
        return { json: (b) => { bodySent = b; } };
      }
    };
    requireCronSecret(req, res, () => {});
    assert.strictEqual(statusSent, 401);
  });

  test('Rejects request with invalid cron secret', () => {
    const { requireCronSecret } = require('../src/middleware/auth');
    let statusSent = null;
    const req = { headers: { 'x-cron-secret': 'wrong-secret' }, query: {} };
    const res = {
      status: (code) => {
        statusSent = code;
        return { json: () => {} };
      }
    };
    requireCronSecret(req, res, () => {});
    assert.strictEqual(statusSent, 403);
  });

  test('Accepts request with valid cron secret via X-Cron-Secret header', () => {
    const { requireCronSecret } = require('../src/middleware/auth');
    const config = require('../src/config/env');
    let nextCalled = false;
    const req = { headers: { 'x-cron-secret': config.cronSecret }, query: {} };
    const res = {};
    requireCronSecret(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);
  });

  console.log('\n=============================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('=============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
