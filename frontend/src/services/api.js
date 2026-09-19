const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

async function request(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  };

  const response = await fetch(url, config);
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const errorMsg = data?.message || `Request failed with status ${response.status}`;
    const err = new Error(errorMsg);
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}

export const api = {
  // Products / Catalog
  searchProducts: (query, page = 1, pageSize = 20) =>
    request(`/api/products/search?q=${encodeURIComponent(query)}&page=${page}&pageSize=${pageSize}`),

  getProductDetails: (id) =>
    request(`/api/products/${id}`),

  // Tracked Products
  getTrackedProducts: () =>
    request('/api/tracker'),

  getTrackedProductById: (id) =>
    request(`/api/tracker/${id}`),

  trackProduct: (externalProductId) =>
    request('/api/tracker', {
      method: 'POST',
      body: JSON.stringify({ externalProductId })
    }),

  untrackProduct: (id) =>
    request(`/api/tracker/${id}`, {
      method: 'DELETE'
    }),

  // Manual Scrape Trigger
  scrapeProduct: (id) =>
    request(`/api/tracker/${id}/scrape`, {
      method: 'POST'
    }),

  // History & Logs
  getPriceHistory: (id, limit = 50) =>
    request(`/api/tracker/${id}/history?limit=${limit}`),

  getScrapeLogs: (id, limit = 50) =>
    request(`/api/tracker/${id}/logs?limit=${limit}`),

  // Health
  getHealth: () =>
    request('/api/health')
};
