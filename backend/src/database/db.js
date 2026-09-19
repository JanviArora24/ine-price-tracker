const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const supabase = require('./supabase');
const config = require('../config/env');

// Local fallback database file path
const DATA_DIR = path.resolve(__dirname, '../../data');
const LOCAL_DB_FILE = path.join(DATA_DIR, 'local_db.json');

// Ensure local storage directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Helper to read local db
function readLocalDb() {
  if (!fs.existsSync(LOCAL_DB_FILE)) {
    const initial = { tracked_products: [], price_history: [], scrape_logs: [] };
    fs.writeFileSync(LOCAL_DB_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  try {
    const content = fs.readFileSync(LOCAL_DB_FILE, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    console.error('[Database] Failed to read local_db.json, resetting:', err.message);
    const initial = { tracked_products: [], price_history: [], scrape_logs: [] };
    fs.writeFileSync(LOCAL_DB_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
}

// Helper to write local db
function writeLocalDb(data) {
  fs.writeFileSync(LOCAL_DB_FILE, JSON.stringify(data, null, 2));
}

// ---------------------------------------------------------------------------
// DATA ACCESS LAYER (DAL) WITH ADAPTIVE SCHEMA SUPPORT
// ---------------------------------------------------------------------------

let tableColumnsCache = null;

async function getAvailableColumns(tableName) {
  if (tableColumnsCache && tableColumnsCache[tableName]) {
    return tableColumnsCache[tableName];
  }
  if (!config.isSupabaseConfigured) return null;
  try {
    const cleanUrl = config.supabaseUrl.replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
    const res = await fetch(`${cleanUrl}/rest/v1/`, {
      headers: {
        apikey: config.supabaseServiceRoleKey,
        Authorization: `Bearer ${config.supabaseServiceRoleKey}`
      }
    });
    if (res.ok) {
      const spec = await res.json();
      const defs = spec.definitions || spec.components?.schemas || {};
      tableColumnsCache = {};
      for (const [t, def] of Object.entries(defs)) {
        tableColumnsCache[t] = new Set(Object.keys(def.properties || {}));
      }
      return tableColumnsCache[tableName] || null;
    }
  } catch (err) {
    console.warn('[Database] Schema cache inspect error:', err.message);
  }
  return null;
}

function normalizeProduct(p) {
  if (!p) return null;
  let extId = p.external_product_id;
  if (extId === null || extId === undefined) {
    const urlStr = p.url || p.product_url || '';
    const match = urlStr.match(/\/product\/(\d+)/);
    if (match) {
      extId = parseInt(match[1], 10);
    } else if (p.id && !isNaN(Number(p.id))) {
      extId = Number(p.id);
    }
  }

  return {
    ...p,
    external_product_id: extId,
    name: p.name || p.product_name || '',
    url: p.url || p.product_url || '',
    current_price: p.current_price !== undefined ? p.current_price : null,
    current_stock: p.current_stock !== undefined ? p.current_stock : null,
    stock_status: p.stock_status || null,
    last_scraped_at: p.last_scraped_at || null,
    last_scrape_status: p.last_scrape_status || 'pending',
    created_at: p.created_at || new Date().toISOString(),
    updated_at: p.updated_at || p.created_at || new Date().toISOString()
  };
}

async function getTrackedProducts() {
  if (config.isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('tracked_products')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new Error(`Supabase error: ${error.message}`);
    return (data || []).map(normalizeProduct);
  }

  const db = readLocalDb();
  return [...db.tracked_products].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

async function getTrackedProductById(id) {
  if (config.isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('tracked_products')
      .select('*')
      .eq('id', id)
      .limit(1);
    if (error) throw new Error(`Supabase error: ${error.message}`);
    return normalizeProduct(data?.[0] || null);
  }

  const db = readLocalDb();
  return db.tracked_products.find(p => p.id === id) || null;
}

async function getTrackedProductByExternalId(externalId) {
  const numericId = parseInt(externalId, 10);
  if (config.isSupabaseConfigured && supabase) {
    const cols = await getAvailableColumns('tracked_products');
    if (!cols || cols.has('external_product_id')) {
      try {
        const { data, error } = await supabase
          .from('tracked_products')
          .select('*')
          .eq('external_product_id', numericId)
          .limit(1);
        if (!error && data?.length) return normalizeProduct(data[0]);
        if (error && !error.message?.includes('external_product_id')) {
          throw new Error(`Supabase error: ${error.message}`);
        }
      } catch (err) {
        if (!err.message?.includes('external_product_id')) throw err;
      }
    }

    // Fallback: check by id if external_product_id column does not exist yet
    const { data, error } = await supabase
      .from('tracked_products')
      .select('*')
      .eq('id', numericId)
      .limit(1);
    if (!error && data?.length) return normalizeProduct(data[0]);
    return null;
  }

  const db = readLocalDb();
  return db.tracked_products.find(p => p.external_product_id === numericId) || null;
}

async function addTrackedProduct(product) {
  const externalId = parseInt(product.external_product_id, 10);
  const now = new Date().toISOString();

  if (config.isSupabaseConfigured && supabase) {
    const cols = await getAvailableColumns('tracked_products');
    const record = {};

    if (!cols || cols.has('external_product_id')) record.external_product_id = externalId;
    if (!cols || cols.has('name')) record.name = product.name;
    if (cols && cols.has('product_name')) record.product_name = product.name;
    if (!cols || cols.has('slug')) record.slug = product.slug || '';
    if (!cols || cols.has('brand')) record.brand = product.brand || '';
    if (!cols || cols.has('category')) record.category = product.category || '';
    if (!cols || cols.has('sku')) record.sku = product.sku || '';
    if (!cols || cols.has('url')) record.url = product.url;
    if (cols && cols.has('product_url')) record.product_url = product.url;
    if (!cols || cols.has('image_url')) record.image_url = product.image_url || '';
    if (!cols || cols.has('current_price')) record.current_price = product.current_price !== undefined ? product.current_price : null;
    if (!cols || cols.has('current_stock')) record.current_stock = product.current_stock !== undefined ? product.current_stock : null;
    if (!cols || cols.has('stock_status')) record.stock_status = product.stock_status || null;
    if (!cols || cols.has('last_scraped_at')) record.last_scraped_at = product.last_scraped_at || null;
    if (!cols || cols.has('last_scrape_status')) record.last_scrape_status = product.last_scrape_status || 'pending';
    if (!cols || cols.has('created_at')) record.created_at = now;
    if (!cols || cols.has('updated_at')) record.updated_at = now;
    if (cols && cols.has('active')) record.active = true;

    const { data, error } = await supabase
      .from('tracked_products')
      .insert(record)
      .select();

    if (error) throw new Error(`Supabase error: ${error.message}`);
    return normalizeProduct(data?.[0] || data);
  }

  const db = readLocalDb();
  const newProduct = {
    id: crypto.randomUUID(),
    external_product_id: externalId,
    name: product.name,
    slug: product.slug || '',
    brand: product.brand || '',
    category: product.category || '',
    sku: product.sku || '',
    url: product.url,
    image_url: product.image_url || '',
    current_price: product.current_price !== undefined ? product.current_price : null,
    current_stock: product.current_stock !== undefined ? product.current_stock : null,
    stock_status: product.stock_status || null,
    last_scraped_at: product.last_scraped_at || null,
    last_scrape_status: product.last_scrape_status || 'pending',
    created_at: now,
    updated_at: now
  };

  db.tracked_products.push(newProduct);
  writeLocalDb(db);
  return newProduct;
}

async function updateTrackedProductPrice(id, updateData) {
  const now = new Date().toISOString();

  if (config.isSupabaseConfigured && supabase) {
    const cols = await getAvailableColumns('tracked_products');
    const payload = {};
    for (const [key, value] of Object.entries(updateData)) {
      if (!cols || cols.has(key)) {
        payload[key] = value;
      }
    }
    if (!cols || cols.has('updated_at')) {
      payload.updated_at = now;
    }

    // Guard against empty payload causing 0-row update error
    if (Object.keys(payload).length === 0) {
      return await getTrackedProductById(id);
    }

    const { data, error } = await supabase
      .from('tracked_products')
      .update(payload)
      .eq('id', id)
      .select();

    if (error) throw new Error(`Supabase error: ${error.message}`);
    return normalizeProduct(data?.[0] || null);
  }

  const db = readLocalDb();
  const product = db.tracked_products.find(p => p.id === id);
  if (!product) return null;

  Object.assign(product, updateData, { updated_at: now });
  writeLocalDb(db);
  return product;
}

async function deleteTrackedProduct(id) {
  if (config.isSupabaseConfigured && supabase) {
    const { error } = await supabase
      .from('tracked_products')
      .delete()
      .eq('id', id);
    if (error) throw new Error(`Supabase error: ${error.message}`);
    return true;
  }

  const db = readLocalDb();
  const initialCount = db.tracked_products.length;
  db.tracked_products = db.tracked_products.filter(p => p.id !== id);
  db.price_history = db.price_history.filter(h => h.tracked_product_id !== id);
  db.scrape_logs = db.scrape_logs.filter(l => l.tracked_product_id !== id);
  writeLocalDb(db);
  return db.tracked_products.length < initialCount;
}

async function insertPriceHistory({ trackedProductId, price, stock, stockStatus, scrapedAt }) {
  if (price === undefined || price === null || isNaN(price)) {
    throw new Error('Cannot insert price history with invalid or empty price');
  }

  if (config.isSupabaseConfigured && supabase) {
    const cols = await getAvailableColumns('price_history');
    const record = {
      tracked_product_id: trackedProductId,
      price: Number(price),
      stock: (cols && cols.has('stock')) ? String(stock ?? 0) : (parseInt(stock, 10) || 0),
      scraped_at: scrapedAt || new Date().toISOString()
    };
    if (!cols || cols.has('stock_status')) {
      record.stock_status = stockStatus || null;
    }

    const { data, error } = await supabase
      .from('price_history')
      .insert(record)
      .select();
    if (error) throw new Error(`Supabase error: ${error.message}`);
    return data?.[0] || data;
  }

  const db = readLocalDb();
  const newHistory = {
    id: crypto.randomUUID(),
    tracked_product_id: trackedProductId,
    price: Number(price),
    stock: parseInt(stock, 10) || 0,
    stock_status: stockStatus || null,
    scraped_at: scrapedAt || new Date().toISOString()
  };
  db.price_history.push(newHistory);
  writeLocalDb(db);
  return newHistory;
}

async function getPriceHistory(trackedProductId, limit = 50) {
  if (config.isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('price_history')
      .select('*')
      .eq('tracked_product_id', trackedProductId)
      .order('scraped_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(`Supabase error: ${error.message}`);
    return data || [];
  }

  const db = readLocalDb();
  return db.price_history
    .filter(h => h.tracked_product_id === trackedProductId)
    .sort((a, b) => new Date(b.scraped_at) - new Date(a.scraped_at))
    .slice(0, limit);
}

async function insertScrapeLog({ trackedProductId, status, attempts = 1, durationMs, httpStatus, errorMessage, details = {} }) {
  if (config.isSupabaseConfigured && supabase) {
    const cols = await getAvailableColumns('scrape_logs');
    const record = {
      tracked_product_id: trackedProductId || null,
      attempted_at: new Date().toISOString(),
      status
    };

    if (!cols || cols.has('attempts')) record.attempts = attempts;
    if (cols && cols.has('attempt_number')) record.attempt_number = attempts;
    if (!cols || cols.has('duration_ms')) record.duration_ms = durationMs || null;
    if (cols && cols.has('response_time_ms')) record.response_time_ms = durationMs || null;
    if (!cols || cols.has('http_status')) record.http_status = httpStatus || null;
    if (!cols || cols.has('error_message')) record.error_message = errorMessage || null;
    if (!cols || cols.has('details')) record.details = details || {};

    const { data, error } = await supabase
      .from('scrape_logs')
      .insert(record)
      .select();
    if (error) throw new Error(`Supabase error: ${error.message}`);
    return data?.[0] || data;
  }

  const db = readLocalDb();
  const newLog = {
    id: crypto.randomUUID(),
    tracked_product_id: trackedProductId || null,
    attempted_at: new Date().toISOString(),
    status,
    attempts,
    duration_ms: durationMs || null,
    http_status: httpStatus || null,
    error_message: errorMessage || null,
    details: details || {}
  };
  db.scrape_logs.push(newLog);
  writeLocalDb(db);
  return newLog;
}

async function getScrapeLogs(trackedProductId, limit = 50) {
  if (config.isSupabaseConfigured && supabase) {
    let query = supabase
      .from('scrape_logs')
      .select('*')
      .order('attempted_at', { ascending: false })
      .limit(limit);
    if (trackedProductId) {
      query = query.eq('tracked_product_id', trackedProductId);
    }
    const { data, error } = await query;
    if (error) throw new Error(`Supabase error: ${error.message}`);
    return data || [];
  }

  const db = readLocalDb();
  let logs = db.scrape_logs;
  if (trackedProductId) {
    logs = logs.filter(l => l.tracked_product_id === trackedProductId);
  }
  return logs
    .sort((a, b) => new Date(b.attempted_at) - new Date(a.attempted_at))
    .slice(0, limit);
}

module.exports = {
  getTrackedProducts,
  getTrackedProductById,
  getTrackedProductByExternalId,
  addTrackedProduct,
  updateTrackedProductPrice,
  deleteTrackedProduct,
  insertPriceHistory,
  getPriceHistory,
  insertScrapeLog,
  getScrapeLogs
};
