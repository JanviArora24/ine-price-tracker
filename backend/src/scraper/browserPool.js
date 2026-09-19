const { chromium } = require('playwright');
const config = require('../config/env');

let sharedBrowser = null;

async function getBrowser(headed = false) {
  if (headed) {
    // For headed demo runs, launch a dedicated visible instance
    return await chromium.launch({
      headless: false,
      slowMo: 120,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }

  if (!sharedBrowser || !sharedBrowser.isConnected()) {
    sharedBrowser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });
  }
  return sharedBrowser;
}

async function closeBrowser(browserInstance, isHeaded = false) {
  if (browserInstance) {
    if (isHeaded || browserInstance !== sharedBrowser) {
      await browserInstance.close().catch(() => {});
    }
  }
}

async function shutdownPool() {
  if (sharedBrowser && sharedBrowser.isConnected()) {
    await sharedBrowser.close().catch(() => {});
    sharedBrowser = null;
  }
}

process.on('exit', () => shutdownPool());
process.on('SIGINT', () => { shutdownPool(); process.exit(); });
process.on('SIGTERM', () => { shutdownPool(); process.exit(); });

module.exports = {
  getBrowser,
  closeBrowser,
  shutdownPool
};
