const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function sanitizeSupabaseUrl(url) {
  if (!url) return '';
  return url.trim().replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
}

const supabaseUrl = sanitizeSupabaseUrl(process.env.SUPABASE_URL);
const supabaseServiceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

const config = {
  port: parseInt(process.env.PORT, 10) || 5000,
  mockStoreBaseUrl: process.env.MOCK_STORE_BASE_URL || 'https://demo.inelabteamdev.com',
  cronSecret: process.env.CRON_SECRET || 'super_secret_cron_token_12345',
  supabaseUrl,
  supabaseServiceRoleKey,
  scrapeHeadless: process.env.SCRAPE_HEADLESS !== 'false',
  scrapeTimeoutMs: parseInt(process.env.SCRAPE_TIMEOUT_MS, 10) || 35000,
  isSupabaseConfigured: Boolean(supabaseUrl && supabaseServiceRoleKey)
};

module.exports = config;
