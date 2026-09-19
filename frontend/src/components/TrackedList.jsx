import React, { useState } from 'react';
import { api } from '../services/api';

export default function TrackedList({
  products = [],
  loading = false,
  onRefresh,
  onOpenHistory,
  onOpenLogs
}) {
  const [scrapingIds, setScrapingIds] = useState(new Set());
  const [untrackingId, setUntrackingId] = useState(null);

  const handleManualScrape = async (productId) => {
    setScrapingIds(prev => new Set(prev).add(productId));
    try {
      await api.scrapeProduct(productId);
      if (onRefresh) onRefresh();
    } catch (err) {
      alert(`Manual scrape failed: ${err.message}`);
    } finally {
      setScrapingIds(prev => {
        const next = new Set(prev);
        next.delete(productId);
        return next;
      });
    }
  };

  const handleUntrack = async (product) => {
    if (!window.confirm(`Are you sure you want to stop tracking "${product.name}"? Historical data will be removed.`)) {
      return;
    }
    setUntrackingId(product.id);
    try {
      await api.untrackProduct(product.id);
      if (onRefresh) onRefresh();
    } catch (err) {
      alert(`Failed to untrack: ${err.message}`);
    } finally {
      setUntrackingId(null);
    }
  };

  if (loading && products.length === 0) {
    return (
      <div className="empty-state">
        <div className="spinner-inline" style={{ width: '28px', height: '28px', marginBottom: '1rem' }}></div>
        <p className="empty-desc">Loading tracked products...</p>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">🏷️</div>
        <h3 className="empty-title">No Tracked Products Yet</h3>
        <p className="empty-desc">
          Use the search bar above to find products in the INE mock store and add them to your automated tracking list.
        </p>
      </div>
    );
  }

  return (
    <section>
      <div className="section-header">
        <div>
          <h2>Tracked Inventory</h2>
          <span>Monitoring live prices and availability on the INE mock store</span>
        </div>
        <span>{products.length} {products.length === 1 ? 'item' : 'items'} tracked</span>
      </div>

      <div className="tracked-grid">
        {products.map((product) => {
          const isScraping = scrapingIds.has(product.id);
          const isUntracking = untrackingId === product.id;
          const status = product.last_scrape_status || 'pending';
          const inStock = product.current_stock > 0;
          const formattedDate = product.last_scraped_at
            ? new Date(product.last_scraped_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
            : 'Never';

          return (
            <div key={product.id} className="tracked-card" id={`card-product-${product.external_product_id}`}>
              <div>
                <div className="card-top">
                  <span className="card-category">{product.category || 'General'}</span>
                  <span className={`status-pill ${status}`} title={`Last scrape status: ${status}`}>
                    {status}
                  </span>
                </div>

                <h3 className="card-title">{product.name}</h3>
                <p className="card-brand-sku">
                  {product.brand} · <span style={{ fontFamily: 'var(--font-mono)' }}>{product.sku}</span>
                </p>

                <div className="price-stock-box">
                  <div className="price-display">
                    <span className="price-label">Current Price</span>
                    <span className="price-value-main">
                      {product.current_price !== null && product.current_price !== undefined
                        ? `₹${Number(product.current_price).toLocaleString('en-IN')}`
                        : '—'}
                    </span>
                  </div>

                  <div>
                    <span className={`stock-badge-pill ${inStock ? 'in-stock' : 'out-stock'}`}>
                      {inStock ? `● In Stock (${product.current_stock})` : '○ Out of Stock'}
                    </span>
                  </div>
                </div>

                <div className="card-meta-row">
                  <span>Last Scrape: {formattedDate}</span>
                  <a
                    href={product.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--accent-primary)', textDecoration: 'none' }}
                  >
                    View on Store ↗
                  </a>
                </div>
              </div>

              <div className="card-actions">
                <button
                  id={`btn-scrape-now-${product.external_product_id}`}
                  className="btn-action scrape-btn"
                  disabled={isScraping || isUntracking}
                  onClick={() => handleManualScrape(product.id)}
                  title="Scrape product price and stock now"
                >
                  {isScraping ? (
                    <>
                      <span className="spinner-inline"></span> Scraping...
                    </>
                  ) : (
                    <>⚡ Scrape Now</>
                  )}
                </button>

                <button
                  id={`btn-history-${product.external_product_id}`}
                  className="btn-action"
                  onClick={() => onOpenHistory(product)}
                  title="View price & stock history"
                >
                  📈 History
                </button>

                <button
                  id={`btn-logs-${product.external_product_id}`}
                  className="btn-action"
                  onClick={() => onOpenLogs(product)}
                  title="View scraper execution logs"
                >
                  📋 Logs
                </button>

                <button
                  id={`btn-untrack-${product.external_product_id}`}
                  className="btn-icon-delete"
                  disabled={isUntracking}
                  onClick={() => handleUntrack(product)}
                  title="Untrack product"
                >
                  🗑
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
