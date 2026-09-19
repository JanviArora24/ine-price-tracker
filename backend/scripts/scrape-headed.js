const { scrapeProductWithRetries } = require('../src/scraper/scraperEngine');

async function runHeadedDemo() {
  // Allow passing a product ID as command line argument, default to 1
  const argId = process.argv[2];
  const productId = parseInt(argId, 10) || 1;

  console.log('===============================================================');
  console.log(`  INE Mock Store Price Tracker - Headed Scraper Visual Demo`);
  console.log('===============================================================');
  console.log(`Target Product ID: ${productId}`);
  console.log(`Launching visible Chromium browser window...`);
  console.log(`Watch the browser window to see:`);
  console.log(`  - Page navigation`);
  console.log(`  - Automated cookie overlay dismissal`);
  console.log(`  - Cursor movement and dwell time over the price block`);
  console.log(`  - Reveal price button activation and click-jitter handling`);
  console.log(`  - Dynamic layout class identification and decoy suppression`);
  console.log(`  - Real-time network response decryption`);
  console.log('---------------------------------------------------------------\n');

  const result = await scrapeProductWithRetries(productId, {
    headed: true,
    maxRetries: 3,
    initialBackoffMs: 1500
  });

  console.log('\n===============================================================');
  console.log('                      SCRAPE RESULT REPORT                     ');
  console.log('===============================================================');
  console.log(`Status:        ${result.status.toUpperCase()}`);
  console.log(`Attempts:      ${result.attempts}`);
  console.log(`Duration:      ${result.durationMs}ms`);

  if (result.success && result.data) {
    const d = result.data;
    console.log(`Product Name:  ${d.name}`);
    console.log(`Category:      ${d.category}`);
    console.log(`Brand / SKU:   ${d.brandSku}`);
    console.log(`Price:         ₹${d.price} (${d.formattedPrice})`);
    console.log(`Stock Count:   ${d.stock}`);
    console.log(`Stock Status:  ${d.stockStatus}`);
    console.log(`Timestamp:     ${d.scrapedAt}`);
    if (d.interceptedQuote) {
      console.log('\n--- Decrypted Live Server Payload ---');
      console.log(JSON.stringify(d.interceptedQuote, null, 2));
    }
  } else {
    console.error(`Error:         ${result.error ? result.error.message : 'Unknown failure'}`);
  }
  console.log('===============================================================\n');
}

runHeadedDemo().catch(err => {
  console.error('Fatal error during headed scrape demo:', err);
  process.exit(1);
});
