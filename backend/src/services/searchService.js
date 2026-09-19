const config = require('../config/env');

let cachedCatalog = null;
let catalogCachedAt = 0;
const CATALOG_CACHE_TTL_MS = 60 * 1000; // 1 minute cache

/**
 * Fetches products from the mock store catalog with pagination and in-memory search
 */
async function getCatalog(page = 1, pageSize = 24) {
  const baseUrl = config.mockStoreBaseUrl;
  const res = await fetch(`${baseUrl}/api/catalog?page=${page}&pageSize=${pageSize}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch catalog from mock store: HTTP ${res.status}`);
  }
  return await res.json();
}

/**
 * Searches the mock store catalog by partial or full product name, SKU, brand, or category
 */
async function searchProducts(query = '', page = 1, pageSize = 20) {
  const q = (query || '').trim().toLowerCase();

  // If query is empty, return the standard paginated catalog
  if (!q) {
    return await getCatalog(page, pageSize);
  }

  // Check if query looks like a SKU (e.g. NOR-10001, 10001) or a direct numeric product ID
  let directProduct = null;
  const skuMatch = q.match(/^[a-z]{3}-10*(\d+)$/i) || q.match(/^10*(\d+)$/);
  const directId = skuMatch ? parseInt(skuMatch[1], 10) : (/^\d+$/.test(q) ? parseInt(q, 10) : null);

  if (directId && directId > 0 && directId <= 1000) {
    try {
      directProduct = await getProductDetails(directId);
    } catch (e) {}
  }

  // Pre-load catalog pages into memory cache (up to 5 pages = 300 products)
  const now = Date.now();
  if (!cachedCatalog || now - catalogCachedAt > CATALOG_CACHE_TTL_MS) {
    try {
      const pagePromises = [1, 2, 3, 4, 5].map(p => getCatalog(p, 60));
      const pageResults = await Promise.all(pagePromises);
      let aggregated = [];
      for (const res of pageResults) {
        if (res && res.items) aggregated.push(...res.items);
      }
      cachedCatalog = aggregated;
      catalogCachedAt = now;
    } catch (err) {
      console.warn('[SearchService] Failed to load catalog cache:', err.message);
    }
  }

  let items = cachedCatalog ? [...cachedCatalog] : [];

  // If a direct product was found via SKU or ID, ensure it is included
  if (directProduct && !items.some(it => it.id === directProduct.id)) {
    items.unshift(directProduct);
  }

  // Filter items matching query
  const filtered = items.filter(item => {
    const nameMatch = item.name && item.name.toLowerCase().includes(q);
    const brandMatch = item.brand && item.brand.toLowerCase().includes(q);
    const skuMatch = item.sku && item.sku.toLowerCase().includes(q);
    const catMatch = item.category && item.category.toLowerCase().includes(q);
    const idMatch = String(item.id) === q;
    return nameMatch || brandMatch || skuMatch || catMatch || idMatch;
  });

  const total = filtered.length;
  const pages = Math.ceil(total / pageSize) || 1;
  const offset = (page - 1) * pageSize;
  const paginatedItems = filtered.slice(offset, offset + pageSize);

  return {
    query,
    page: parseInt(page, 10),
    pageSize: parseInt(pageSize, 10),
    total,
    pages,
    items: paginatedItems
  };
}

/**
 * Retrieves detailed product metadata from /api/product/:id
 */
async function getProductDetails(productId) {
  const baseUrl = config.mockStoreBaseUrl;
  const res = await fetch(`${baseUrl}/api/product/${productId}`);
  if (!res.ok) {
    if (res.status === 404) {
      return null;
    }
    throw new Error(`Failed to fetch product ${productId}: HTTP ${res.status}`);
  }
  return await res.json();
}

module.exports = {
  getCatalog,
  searchProducts,
  getProductDetails
};
